import { Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryPlan } from '../contracts/query-plan';
import { QueryResult } from '../contracts/query-result';
import { QueryCacheService } from '../cache/query-cache.service';
import { JobStateV2 } from './data-job-v2.state';

@Injectable()
export class DataJobV2Service {
  constructor(private readonly prisma: PrismaService, private readonly cache: QueryCacheService) {}
  async createOrGet(plan: QueryPlan) {
    const organizationId = plan.securityScope.organizationId;
    try {
      const job = await this.prisma.dataJobV2.create({ data: {
        organizationId, queryId: plan.queryId, requestId: plan.requestId,
        queryFingerprint: plan.queryFingerprint, registryVersion: plan.registryVersion,
        permissionAction: plan.metric.requiredPermission.action,
        permissionResource: plan.metric.requiredPermission.resource,
        dispatchDeadlineAt: new Date(Date.now() + 15000),
      } });
      return { job, created: true };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const job = await this.prisma.dataJobV2.findFirst({
        where: { organizationId, queryFingerprint: plan.queryFingerprint,
          state: { in: ['PENDING', 'DISPATCHED', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (job) return { job, created: false };
      // Le job gagnant peut se terminer entre la collision et cette lecture.
      const completed = await this.prisma.dataJobV2.findFirst({
        where: { organizationId, queryFingerprint: plan.queryFingerprint, state: 'COMPLETED',
          resultExpiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (completed) return { job: completed, created: false };
      throw error;
    }
  }
  async transition(jobId: string, organizationId: string, allowed: JobStateV2[],
    next: JobStateV2, agentId?: string, errorCode?: string) {
    const current = await this.prisma.dataJobV2.findFirst({ where: { id: jobId, organizationId } });
    if (!current) throw new NotFoundException('Job V2 introuvable');
    if (!allowed.includes(current.state as JobStateV2)) return { job: current, changed: false };
    if (agentId && next !== 'DISPATCHED' && current.agentId !== agentId) return { job: current, changed: false };
    const now = new Date();
    const change = await this.prisma.dataJobV2.updateMany({
      where: { id: jobId, organizationId, state: { in: allowed }, version: current.version,
        ...(agentId ? { agentId } : {}) },
      data: { state: next, version: { increment: 1 },
        ...(next === 'DISPATCHED' && agentId ? { agentId } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(next === 'DISPATCHED' ? { dispatchedAt: now } : {}),
        ...(next === 'RUNNING' ? { acknowledgedAt: now, startedAt: now, executionDeadlineAt: new Date(now.getTime() + 30000) } : {}),
        ...(['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED'].includes(next) ? { finishedAt: now } : {}) },
    });
    const job = await this.prisma.dataJobV2.findUnique({ where: { id: jobId } });
    return { job: job!, changed: change.count === 1 };
  }
  async complete(jobId: string, organizationId: string, result: QueryResult, agentId?: string) {
    const current = await this.prisma.dataJobV2.findFirst({ where: { id: jobId, organizationId } });
    if (!current) throw new NotFoundException('Job V2 introuvable');
    if (!['DISPATCHED', 'RUNNING'].includes(current.state) || agentId && current.agentId !== agentId)
      return { job: current, changed: false };
    const encrypted = this.cache.encrypt(result);
    const changed = await this.prisma.dataJobV2.updateMany({
      where: { id: jobId, organizationId, state: { in: ['DISPATCHED', 'RUNNING'] },
        version: current.version, ...(agentId ? { agentId } : {}) },
      data: { state: 'COMPLETED', version: { increment: 1 }, finishedAt: new Date(),
        resultCiphertext: encrypted.ciphertext, resultIv: encrypted.iv, encryptionKeyId: encrypted.keyId,
        resultExpiresAt: new Date(Date.now() + 300000) },
    });
    const job = await this.prisma.dataJobV2.findUnique({ where: { id: jobId } });
    return { job: job!, changed: changed.count === 1 };
  }
  async get(jobId: string, organizationId: string) {
    const job = await this.prisma.dataJobV2.findFirst({ where: { id: jobId, organizationId } });
    if (!job) throw new NotFoundException('Job V2 introuvable');
    const result = job.state === 'COMPLETED' && job.resultCiphertext && job.resultIv &&
      job.resultExpiresAt && job.resultExpiresAt > new Date()
      ? this.cache.decrypt(job.resultCiphertext, job.resultIv) : undefined;
    return { jobId: job.id, queryId: job.queryId, state: job.state, result,
      error: job.errorCode ? { code: job.errorCode } : undefined };
  }
  async cancel(jobId: string, organizationId: string) {
    return this.transition(jobId, organizationId, ['PENDING', 'DISPATCHED', 'RUNNING'], 'CANCELLED');
  }
  @Interval(10000)
  async expireDueJobs() {
    if (process.env.DATA_ENGINE_V2_ENABLED !== 'true' ||
        process.env.NODE_ENV !== 'test' && process.env.DATA_ENGINE_V2_PERSISTENCE_APPROVED !== 'true')
      return { dispatch: 0, execution: 0 };
    const now = new Date();
    const dispatch = await this.prisma.dataJobV2.updateMany({
      where: { state: { in: ['PENDING', 'DISPATCHED'] }, dispatchDeadlineAt: { lt: now } },
      data: { state: 'TIMED_OUT', errorCode: 'QUERY_TIMEOUT', finishedAt: now, version: { increment: 1 } },
    });
    const execution = await this.prisma.dataJobV2.updateMany({
      where: { state: 'RUNNING', executionDeadlineAt: { lt: now } },
      data: { state: 'TIMED_OUT', errorCode: 'QUERY_TIMEOUT', finishedAt: now, version: { increment: 1 } },
    });
    await this.prisma.dataJobV2.updateMany({
      where: { resultExpiresAt: { lt: now }, resultCiphertext: { not: null } },
      data: { resultCiphertext: null, resultIv: null, encryptionKeyId: null },
    });
    return { dispatch: dispatch.count, execution: execution.count };
  }
}
