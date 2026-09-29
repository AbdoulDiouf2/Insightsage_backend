import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryRequest } from './contracts/query-request';
import { QueryFailure } from './contracts/query-error';
import { QueryResult } from './contracts/query-result';
import { AuthenticatedIdentity, SecurityScopeService } from './planner/security-scope.service';
import { QueryPlannerService } from './planner/query-planner.service';
import { QueryCacheService } from './cache/query-cache.service';
import { DataJobV2Service } from './jobs/data-job-v2.service';
import { DataJobV2Dispatcher } from './jobs/data-job-v2.dispatcher';
import { SemanticRegistryService } from './semantic/semantic-registry.service';
import { comparisonDimensionValue, validateMetricRows } from './results/metric-result-policy';

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);
  constructor(private readonly prisma: PrismaService,
    private readonly scope: SecurityScopeService,
    private readonly planner: QueryPlannerService,
    private readonly cache: QueryCacheService,
    private readonly jobs: DataJobV2Service,
    private readonly dispatcher: DataJobV2Dispatcher,
    private readonly registry: SemanticRegistryService) {}

  private enabled() {
    if (process.env.DATA_ENGINE_V2_ENABLED !== 'true')
      throw new QueryFailure('NOT_CONFIGURED', 'Data Engine V2 non activé');
  }
  async query(request: QueryRequest, user: AuthenticatedIdentity) {
    this.enabled();
    const securityScope = this.scope.resolve(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: securityScope.organizationId }, select: { dataTimezone: true },
    });
    if (!org) throw new QueryFailure('PERMISSION_DENIED', 'Organisation introuvable');
    if (request.period && !org.dataTimezone)
      throw new QueryFailure('NOT_CONFIGURED', 'Fuseau organisation non configuré');
    const plan = this.planner.plan(request, user, org.dataTimezone ?? 'UTC');
    // La permission métrique est revalidée par le planificateur avant tout cache.
    const cached = await this.cache.get(securityScope.organizationId, plan.queryFingerprint, this.registry.version);
    if (cached) return { status: 'completed', result: { ...cached, queryId: plan.queryId } };
    const { job, created } = await this.jobs.createOrGet(plan);
    if (!created) {
      if (job.state === 'COMPLETED') {
        const completed = await this.jobs.get(job.id, securityScope.organizationId);
        if (completed.result) return { status: 'completed', result: { ...completed.result, queryId: plan.queryId } };
      }
      if (job.state !== 'PENDING') return { status: 'pending', jobId: job.id, queryId: job.queryId };
      // An active duplicate may be the first request able to dispatch this job.
      // The atomic PENDING -> DISPATCHED transition below selects one claimant.
      plan.queryId = job.queryId;
      plan.requestId = job.requestId;
    }
    try {
      const agentId = this.dispatcher.agentFor(securityScope.organizationId);
      if (!this.dispatcher.hasSimulator() && !agentId)
        throw new QueryFailure('AGENT_OFFLINE', 'Aucun agent V2 capable disponible');
      const dispatched = await this.jobs.transition(job.id, securityScope.organizationId,
        ['PENDING'], 'DISPATCHED', agentId);
      if (!dispatched.changed)
        return { status: 'pending', jobId: job.id, queryId: plan.queryId };
      const started = Date.now();
      const execution = await this.dispatcher.execute(plan, job.id, 1);
      const previous = plan.comparisonExecution
        ? await this.dispatcher.execute({ ...plan, execution: plan.comparisonExecution,
          period: plan.comparison ? { ...plan.period!,
            fromInclusive: plan.comparison.fromInclusive!,
            toExclusive: plan.comparison.toExclusive! } : undefined,
          comparisonExecution: undefined }, job.id, 2)
        : undefined;
      validateMetricRows(plan, execution.rows);
      if (previous) validateMetricRows(plan, previous.rows);
      const normalize = (rows: Record<string, unknown>[]) => rows
        .filter(row => plan.metric.resultPolicy?.empty === 'zero_if_empty_set' ||
          row.__source_row_count === undefined || Number(row.__source_row_count) > 0)
        .map(({ __source_row_count, ...row }) => row);
      const currentRows = normalize(execution.rows);
      const comparisonRows = normalize(previous?.rows ?? []);
      const joinedRows = previous ? currentRows.map(row => {
        const match = comparisonRows.find(other => plan.dimensions.every(d =>
          other[d.key] === comparisonDimensionValue(d.key, row[d.key], plan)));
        return { ...row, previous_value: match?.value ?? null };
      }) : currentRows;
      await this.jobs.transition(job.id, securityScope.organizationId, ['DISPATCHED'], 'RUNNING');
      if (joinedRows.length > plan.limits.maxRows)
        throw new QueryFailure('RESULT_TOO_LARGE', 'Résultat trop volumineux');
      const generatedAt = new Date().toISOString();
      const result: QueryResult = {
        queryId: plan.queryId, status: currentRows.length ? 'success' : 'empty',
        schema: [{ key: 'value', type: plan.metric.dataType, nullable: true, role: 'metric',
          unit: plan.metric.resultPolicy?.unit },
          ...plan.dimensions.map(d => ({ key: d.key, type: d.dataType, nullable: true, role: 'dimension' as const })),
          ...(previous ? [{ key: 'previous_value', type: plan.metric.dataType,
            nullable: true, role: 'comparison' as const, unit: plan.metric.resultPolicy?.unit }] : [])],
        rows: joinedRows,
        meta: { rowCount: joinedRows.length, generatedAt, queryExecutedAt: generatedAt,
          sourceFreshness: execution.sourceFreshness, executionTimeMs: Date.now() - started,
          cache: 'none', truncated: false },
      };
      const completed = await this.jobs.complete(job.id, securityScope.organizationId, result);
      if (!completed.changed) return { status: 'pending', jobId: job.id, queryId: plan.queryId };
      const sourceRows = execution.rows.some(row => row.__source_row_count !== undefined)
        ? execution.rows.reduce((sum, row) => sum + Number(row.__source_row_count ?? 0), 0)
        : 'unavailable';
      this.logger.log(`data_v2 completed queryId=${plan.queryId} jobId=${job.id} metric=${plan.metric.key} agentId=${agentId ?? 'simulated'} organizationId=${securityScope.organizationId} state=COMPLETED resultStatus=${result.status} resultRows=${result.meta.rowCount} sourceRows=${sourceRows} durationMs=${result.meta.executionTimeMs}`);
      try {
        await this.cache.put(securityScope.organizationId, plan.queryFingerprint,
          this.registry.version, result, plan.metric.defaultCacheTtlSeconds);
      } catch (cacheError: any) {
        this.logger.warn(`Cache V2 indisponible pour job ${job.id}: ${cacheError?.code ?? 'INTERNAL_ERROR'}`);
      }
      return { status: 'completed', result };
    } catch (error: any) {
      await this.jobs.transition(job.id, securityScope.organizationId,
        ['PENDING', 'DISPATCHED', 'RUNNING'],
        error instanceof QueryFailure && error.code === 'QUERY_TIMEOUT' ? 'TIMED_OUT' : 'FAILED',
        undefined, error instanceof QueryFailure ? error.code : 'INTERNAL_ERROR');
      throw error;
    }
  }
  private async authorizedJob(jobId: string, user: AuthenticatedIdentity) {
    const organizationId = this.scope.resolve(user).organizationId;
    const job = await this.prisma.dataJobV2.findFirst({ where: { id: jobId, organizationId } });
    if (!job) throw new NotFoundException('Job V2 introuvable');
    if (!this.scope.hasPermission(user, job.permissionAction, job.permissionResource))
      throw new ForbiddenException('Permission manquante');
    return organizationId;
  }
  async getJob(jobId: string, user: AuthenticatedIdentity) {
    this.enabled();
    return this.jobs.get(jobId, await this.authorizedJob(jobId, user));
  }
  async cancelJob(jobId: string, user: AuthenticatedIdentity) {
    this.enabled();
    const organizationId = await this.authorizedJob(jobId, user);
    const changed = await this.jobs.cancel(jobId, organizationId);
    return { jobId, state: changed.job.state, physicalCancellation: false };
  }
}
