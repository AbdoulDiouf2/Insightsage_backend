import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBugDto, UpdateBugStatusDto, AddCommentDto } from '../dto/bug.dto';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class BugsService {
  private readonly logger = new Logger(BugsService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createBugDto: CreateBugDto, userId: string, organizationId: string) {
    // Generate bugId: BR-YYYYMMDD-XXX
    const now = new Date();
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const lastBug = await this.prisma.bug.findFirst({
      where: {
        bugId: {
          startsWith: `BR-${today}`,
        },
      },
      orderBy: {
        bugId: 'desc',
      },
    });

    let nextNumber = 1;
    if (lastBug) {
      const lastPart = lastBug.bugId.split('-').pop();
      if (lastPart) {
        nextNumber = parseInt(lastPart, 10) + 1;
      }
    }
    const bugId = `BR-${today}-${nextNumber.toString().padStart(3, '0')}`;

    // Handle attachments
    let attachments = createBugDto.attachments || [];
    if (attachments.length > 0) {
      try {
        attachments = await this.storageService.confirmUploads(attachments, bugId);
      } catch (error) {
        this.logger.error(`Failed to move attachments for ${bugId}: ${error.message}`);
      }
    }

    const bug = await this.prisma.bug.create({
      data: {
        ...createBugDto,
        attachments,
        bugId,
        submittedById: userId,
        organizationId: createBugDto.organizationId !== undefined ? createBugDto.organizationId : organizationId,
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
      },
    });

    // Notify admins
    this.notificationsService.notifyNewBug(bug, bug.organizationId ?? undefined).catch((err) => {
      this.logger.error(`Failed to notify admins for bug ${bug.bugId}: ${err.message}`);
    });

    // Confirm receipt to submitter
    this.notificationsService.notifyBugSubmitted(bug, bug.submittedBy).catch((err) => {
      this.logger.error(`Failed to notify submitter for new bug ${bug.bugId}: ${err.message}`);
    });

    return bug;
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
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
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
        organization: {
          select: { id: true, name: true },
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
    const bug = await this.prisma.bug.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    const updated = await this.prisma.bug.update({
      where: { id },
      data: { status: updateBugStatusDto.status },
    });
    if (updateBugStatusDto.status === 'resolu' && bug?.submittedBy) {
      this.notificationsService.notifyBugResolved(updated, bug.submittedBy).catch((err) => {
        this.logger.error(`Failed to notify submitter for bug ${updated.bugId}: ${err.message}`);
      });
    }
    return updated;
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

  async getRecentComments(since: Date) {
    return this.prisma.bugComment.findMany({
      where: { createdAt: { gt: since } },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        bug: { select: { id: true, bugId: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
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

    const resolvedBugs = await this.prisma.bug.findMany({
      where: { status: 'resolu' },
      select: { createdAt: true, updatedAt: true },
    });
    const avgResolutionTimeDays =
      resolvedBugs.length > 0
        ? Math.round(
            (resolvedBugs.reduce((sum, b) => {
              return sum + (b.updatedAt.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            }, 0) /
              resolvedBugs.length) *
              10,
          ) / 10
        : 0;

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
      byModule: Object.fromEntries(byModule.map((m) => [m.module, m._count])),
      avgResolutionTimeDays,
    };
  }
}
