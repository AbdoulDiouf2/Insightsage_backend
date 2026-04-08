import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBugDto, UpdateBugStatusDto, AddCommentDto } from '../dto/bug.dto';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class BugsService {
  private readonly logger = new Logger(BugsService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async create(createBugDto: CreateBugDto, userId: string, organizationId: string) {
    // Generate bugId: BR-YYYYMMDD-XXX
    const now = new Date();
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.bug.count({
      where: {
        bugId: {
          startsWith: `BR-${today}`,
        },
      },
    });
    const bugId = `BR-${today}-${(count + 1).toString().padStart(3, '0')}`;

    // Handle attachments
    let attachments = createBugDto.attachments || [];
    if (attachments.length > 0) {
      try {
        attachments = await this.storageService.confirmUploads(attachments, bugId);
      } catch (error) {
        this.logger.error(`Failed to move attachments for ${bugId}: ${error.message}`);
      }
    }

    return this.prisma.bug.create({
      data: {
        ...createBugDto,
        attachments,
        bugId,
        submittedById: userId,
        organizationId: createBugDto.organizationId !== undefined ? createBugDto.organizationId : organizationId,
      },
    });
  }

  async findAll(organizationId?: string, filters?: any) {
    return this.prisma.bug.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...filters,
      },
      include: {
        submittedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const bug = await this.prisma.bug.findUnique({
      where: { id },
      include: {
        submittedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!bug) {
      throw new NotFoundException(`Bug with ID ${id} not found`);
    }

    return bug;
  }

  async updateStatus(id: string, updateBugStatusDto: UpdateBugStatusDto) {
    return this.prisma.bug.update({
      where: { id },
      data: { status: updateBugStatusDto.status },
    });
  }

  async assign(id: string, userId: string) {
    return this.prisma.bug.update({
      where: { id },
      data: { assignedToId: userId },
    });
  }

  async addComment(id: string, addCommentDto: AddCommentDto, userId: string) {
    return this.prisma.bugComment.create({
      data: {
        bugId: id,
        authorId: userId,
        content: addCommentDto.content,
        isInternal: addCommentDto.isInternal,
      },
    });
  }

  async getStats() {
    const total = await this.prisma.bug.count();
    const byStatus = await this.prisma.bug.groupBy({
      by: ['status'],
      _count: true,
    });
    const byPriority = await this.prisma.bug.groupBy({
      by: ['priority'],
      _count: true,
    });
    const byModule = await this.prisma.bug.groupBy({
      by: ['module'],
      _count: true,
    });

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
      byModule: Object.fromEntries(byModule.map((m) => [m.module, m._count])),
      avgResolutionTimeDays: 0, // A calculer si besoin
    };
  }
}
