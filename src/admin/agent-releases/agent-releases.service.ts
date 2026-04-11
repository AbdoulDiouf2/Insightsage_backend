import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AuditLogService } from '../../logs/audit-log.service';
import { CreateAgentReleaseDto } from './agent-release.dto';

@Injectable()
export class AgentReleasesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private auditLog: AuditLogService,
  ) {}

  async uploadRelease(
    file: Express.Multer.File,
    dto: CreateAgentReleaseDto,
    uploadedBy: string,
  ) {
    const checksum = 'sha256:' + createHash('sha256').update(file.buffer).digest('hex');
    const arch = dto.arch ?? 'x64';
    const cleanKey = `${dto.version}/${dto.platform}/${arch}/${file.originalname}`;
    const fileUrl = await this.storage.uploadFile(file, 'agent-releases', cleanKey);

    const release = await this.prisma.agentRelease.create({
      data: {
        version: dto.version,
        platform: dto.platform,
        arch,
        fileName: file.originalname,
        fileUrl,
        fileSize: BigInt(file.size),
        checksum,
        changelog: dto.changelog,
        uploadedBy,
      },
    });

    await this.auditLog.log({
      event: 'agent_release_uploaded',
      userId: uploadedBy,
      payload: {
        releaseId: release.id,
        version: release.version,
        platform: release.platform,
        arch: release.arch,
        fileName: release.fileName,
        fileSize: file.size,
      },
    });

    return release;
  }

  async setLatest(id: string, userId?: string) {
    const release = await this.prisma.agentRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release introuvable.');

    await this.prisma.agentRelease.updateMany({
      where: { platform: release.platform },
      data: { isLatest: false },
    });

    const updated = await this.prisma.agentRelease.update({
      where: { id },
      data: { isLatest: true },
    });

    await this.auditLog.log({
      event: 'agent_release_set_latest',
      userId,
      payload: {
        releaseId: id,
        version: release.version,
        platform: release.platform,
        arch: release.arch,
      },
    });

    return updated;
  }

  async listReleases(filters?: { platform?: string; isLatest?: boolean }) {
    return this.prisma.agentRelease.findMany({
      where: {
        ...(filters?.platform && { platform: filters.platform }),
        ...(filters?.isLatest !== undefined && { isLatest: filters.isLatest }),
      },
      orderBy: [{ platform: 'asc' }, { uploadedAt: 'desc' }],
    });
  }

  async deleteRelease(id: string, userId?: string) {
    const release = await this.prisma.agentRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release introuvable.');

    await this.prisma.agentRelease.delete({ where: { id } });
    await this.storage.deleteFile(release.fileUrl);

    await this.auditLog.log({
      event: 'agent_release_deleted',
      userId,
      payload: {
        releaseId: id,
        version: release.version,
        platform: release.platform,
        arch: release.arch,
        fileName: release.fileName,
      },
    });

    return { message: 'Release supprimee.' };
  }
}
