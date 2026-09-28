import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from '../../agents/agents.module';
import { DataEngineModule } from '../data-engine.module';
import { AgentsGateway } from '../../agents/agents.gateway';
import { AgentsService } from '../../agents/agents.service';
import { DataService } from '../data.service';
import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SecurityScopeService } from '../planner/security-scope.service';

describe('V2 Agent selection across the actual Nest module graph', () => {
  it('connect + accepted hello for the same organization gives DataService a dispatchable Agent', async () => {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }),
      AgentsModule, DataEngineModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(REDIS_CLIENT).useValue({ on: jest.fn(), isReady: false })
      .overrideProvider(AgentsService).useValue({
        validateAgentToken: jest.fn().mockResolvedValue({ id: 'agent-1',
          organizationId: 'org-1', name: 'pilot' }),
        setAgentConnected: jest.fn(), setAgentDisconnected: jest.fn(),
      }).compile();
    try {
      const gateway = module.get(AgentsGateway);
      const dispatcher = module.get(DataJobV2Dispatcher);
      const data = module.get(DataService);
      const socket: any = { id: 'socket-1', handshake: { auth: { token: 'opaque' } },
        data: {}, join: jest.fn(), emit: jest.fn() };
      (gateway as any).server = { sockets: new Map([['socket-1', socket]]),
        to: () => ({ emit: jest.fn() }) };
      gateway.onModuleInit();
      await gateway.handleConnection(socket);
      expect(gateway.handleAgentHelloV2(socket, { protocolVersions: [1, 2],
        capabilities: ['query_parameters', 'typed_schema'] })).toEqual({
        status: 'accepted', protocolVersion: 2 });
      expect((data as any).dispatcher).toBe(dispatcher);
      expect(dispatcher.agentFor('org-1')).toBe('agent-1');
    } finally { await module.close(); }
  });

  it.each([['new', true], ['deduplicated', false]])(
    'dispatches a %s PENDING revenue_ht job to an accepted Agent for the same organization',
    async (_label, created) => {
    const dispatcher = new DataJobV2Dispatcher();
    const socket: any = { id: 'socket-1', handshake: { auth: { token: 'opaque' } },
      data: {}, join: jest.fn(), emit: jest.fn() };
    const gateway = new AgentsGateway({
      validateAgentToken: jest.fn().mockResolvedValue({ id: 'agent-1', organizationId: 'org-1', name: 'pilot' }),
      setAgentConnected: jest.fn(),
    } as any, {} as any, dispatcher);
    (gateway as any).server = { sockets: new Map([['socket-1', socket]]), to: () => ({ emit: jest.fn() }) };
    gateway.onModuleInit();
    await gateway.handleConnection(socket);
    expect(gateway.handleAgentHelloV2(socket, { protocolVersions: [1, 2],
      capabilities: ['query_parameters', 'typed_schema'] })).toEqual({ status: 'accepted', protocolVersion: 2 });
    expect(dispatcher.agentFor('org-1')).toBe('agent-1');

    const plan: any = { queryId: 'new-query', requestId: 'new-request', queryFingerprint: 'same-fingerprint',
      securityScope: { organizationId: 'org-1' }, metric: { key: 'revenue_ht', dataType: 'currency',
        defaultCacheTtlSeconds: 60, requiredPermission: { action: 'read', resource: 'data' } },
      dimensions: [], execution: { statement: 'SELECT 1', parameters: {} },
      limits: { maxRows: 1000, timeoutMs: 1000 } };
    const job = { id: 'existing-job', queryId: created ? 'new-query' : 'existing-query',
      requestId: 'existing-request', agentId: null as string | null,
      organizationId: 'org-1', state: 'PENDING' };
    const jobs: any = {
      createOrGet: jest.fn().mockResolvedValue({ job, created }),
      transition: jest.fn().mockImplementation(async (_id, _org, _allowed, next, agentId) => {
        job.state = next;
        if (agentId) job.agentId = agentId;
        return { changed: true, job: { ...job } };
      }),
      complete: jest.fn().mockResolvedValue({ changed: true }),
    };
    const execute = jest.spyOn(dispatcher, 'execute').mockResolvedValue({
      rows: [{ value: '1.00', __source_row_count: 1 }],
    });
    const data = new DataService({ organization: { findUnique: jest.fn().mockResolvedValue({
      dataTimezone: 'Africa/Dakar' }) } } as any, new SecurityScopeService(),
    { plan: jest.fn().mockReturnValue(plan) } as any, { get: jest.fn().mockResolvedValue(null),
      put: jest.fn() } as any, jobs, dispatcher, { version: 'test' } as any);
    const originalFlag = process.env.DATA_ENGINE_V2_ENABLED;
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    try {
      const response = await data.query({} as any, { id: 'user-1', organizationId: 'org-1' });
      expect(jobs.transition).toHaveBeenCalledWith('existing-job', 'org-1',
        ['PENDING'], 'DISPATCHED', 'agent-1');
      expect(execute).toHaveBeenCalled();
      expect(job.agentId).toBe('agent-1');
      expect(response).toMatchObject({ status: 'completed', result: { queryId: job.queryId } });
    } finally {
      if (originalFlag === undefined) delete process.env.DATA_ENGINE_V2_ENABLED;
      else process.env.DATA_ENGINE_V2_ENABLED = originalFlag;
    }
  });
});
