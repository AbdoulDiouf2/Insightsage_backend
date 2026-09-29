import { Injectable, Logger } from '@nestjs/common';
import { QueryPlan } from '../contracts/query-plan';
import { QueryFailure } from '../contracts/query-error';

export interface SimulatedConnector {
  execute(plan: QueryPlan): Promise<{ rows: Record<string, unknown>[]; sourceFreshness?: string }>;
}
export interface V2AgentTransport {
  agentFor(organizationId: string): string | undefined;
  send(organizationId: string, agentId: string, payload: Record<string, unknown>): boolean;
}
interface PendingExecution {
  organizationId: string;
  agentId: string;
  queryId: string;
  sequence: number;
  resolve: (result: { rows: Record<string, unknown>[]; sourceFreshness?: string }) => void;
  reject: (error: QueryFailure) => void;
  timer: NodeJS.Timeout;
}
@Injectable()
export class DataJobV2Dispatcher {
  private readonly logger = new Logger(DataJobV2Dispatcher.name);
  private simulator?: SimulatedConnector;
  private transport?: V2AgentTransport;
  private readonly pending = new Map<string, PendingExecution>();
  setSimulatorForTest(simulator: SimulatedConnector) {
    if (process.env.NODE_ENV !== 'test') throw new QueryFailure('PERMISSION_DENIED', 'Simulation réservée aux tests');
    this.simulator = simulator;
  }
  registerTransport(transport: V2AgentTransport) { this.transport = transport; }
  agentFor(organizationId: string): string | undefined {
    if (this.simulator) return undefined;
    return this.transport?.agentFor(organizationId);
  }
  hasSimulator() { return !!this.simulator; }
  async execute(plan: QueryPlan, jobId?: string, sequence = 1):
    Promise<{ rows: Record<string, unknown>[]; sourceFreshness?: string }> {
    if (this.simulator) return this.simulator.execute(plan);
    const organizationId = plan.securityScope.organizationId;
    const agentId = this.transport?.agentFor(organizationId);
    if (!this.transport || !agentId || !jobId)
      throw new QueryFailure('AGENT_OFFLINE', 'Aucun agent V2 capable disponible');
    if (this.pending.has(jobId)) throw new QueryFailure('INTERNAL_ERROR', 'Exécution V2 déjà en cours');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new QueryFailure('QUERY_TIMEOUT', 'Délai agent V2 dépassé'));
      }, Math.min(plan.limits.timeoutMs, 30000));
      this.pending.set(jobId, { organizationId, agentId, queryId: plan.queryId,
        sequence, resolve, reject, timer });
      try {
        const payload = {
          protocolVersion: 2, jobId, queryId: plan.queryId, requestId: plan.requestId,
          resourceId: 'sage100:finance_general',
          statement: plan.execution.statement, parameters: plan.execution.parameters,
          sequence, limits: { ...plan.limits, maxResultBytes: 1048576 },
        };
        const sent = this.transport!.send(organizationId, agentId, payload);
        if (sent) this.logger.log(`data_v2 dispatch ${JSON.stringify({
          queryId: plan.queryId, jobId, metric: plan.metric?.key ?? 'unknown', agentId, organizationId, sequence,
        })}`);
        if (!sent) this.fail(jobId, organizationId, agentId, plan.queryId, sequence,
          new QueryFailure('AGENT_OFFLINE', 'Agent V2 déconnecté'));
      } catch {
        this.fail(jobId, organizationId, agentId, plan.queryId, sequence,
          new QueryFailure('AGENT_OFFLINE', 'Émission V2 impossible'));
      }
    });
  }
  isPending(jobId: string, organizationId: string, agentId: string, queryId: string,
    sequence: number): boolean {
    const entry = this.pending.get(jobId);
    return !!entry && entry.organizationId === organizationId && entry.agentId === agentId &&
      entry.queryId === queryId && entry.sequence === sequence;
  }
  receive(jobId: string, organizationId: string, agentId: string, queryId: string,
    sequence: number, rows: Record<string, unknown>[], sourceFreshness?: string): boolean {
    if (!this.isPending(jobId, organizationId, agentId, queryId, sequence)) return false;
    const entry = this.pending.get(jobId)!;
    clearTimeout(entry.timer);
    this.pending.delete(jobId);
    entry.resolve({ rows, sourceFreshness });
    return true;
  }
  fail(jobId: string, organizationId: string, agentId: string, queryId: string,
    sequence: number, error: QueryFailure): boolean {
    if (!this.isPending(jobId, organizationId, agentId, queryId, sequence)) return false;
    const entry = this.pending.get(jobId)!;
    clearTimeout(entry.timer);
    this.pending.delete(jobId);
    entry.reject(error);
    return true;
  }
  disconnected(organizationId: string, agentId: string) {
    for (const [jobId, entry] of this.pending)
      if (entry.organizationId === organizationId && entry.agentId === agentId)
        this.fail(jobId, organizationId, agentId, entry.queryId, entry.sequence,
          new QueryFailure('AGENT_OFFLINE', 'Agent V2 déconnecté'));
  }
}
