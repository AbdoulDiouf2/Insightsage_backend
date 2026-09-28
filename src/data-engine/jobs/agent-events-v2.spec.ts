import { AgentsGateway } from '../../agents/agents.gateway';
import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';
import { Logger } from '@nestjs/common';

describe('agent_hello_v2 backend logs', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs receipt and accepted capabilities without logging the full payload', () => {
    const gateway = new AgentsGateway({} as any, {} as any);
    const socket: any = { data: { agentId: 'agent-1', organizationId: 'org-1' } };
    const payload: any = { protocolVersions: [1, 2],
      capabilities: ['query_parameters', 'typed_schema', 'secret-capability'],
      token: 'secret-token', sqlConnection: 'secret-connection' };

    expect(gateway.handleAgentHelloV2(socket, payload)).toEqual({ status: 'accepted', protocolVersion: 2 });
    const messages = log.mock.calls.map(([message]) => String(message));
    expect(messages).toContain('agent_hello_v2 received agentId=agent-1 organizationId=org-1 protocolVersion=2');
    expect(messages).toContain('agent_hello_v2 accepted=true agentId=agent-1 organizationId=org-1 protocolVersion=2 capabilities=query_parameters,typed_schema');
    expect(messages.join(' ')).not.toMatch(/secret-token|secret-connection|secret-capability/);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs rejection with a fixed reason and no sensitive payload fields', () => {
    const gateway = new AgentsGateway({} as any, {} as any);
    const socket: any = { data: { agentId: 'agent-1', organizationId: 'org-1' } };
    const payload: any = { protocolVersions: [1, 2], capabilities: ['query_parameters', 'secret-capability'],
      token: 'secret-token', encryptionKey: 'secret-key' };

    expect(gateway.handleAgentHelloV2(socket, payload)).toEqual({ status: 'rejected' });
    expect(socket.data.v2Capable).toBeUndefined();
    const messages = [...log.mock.calls, ...warn.mock.calls].map(([message]) => String(message)).join(' ');
    expect(messages).toContain('agent_hello_v2 received agentId=agent-1 organizationId=org-1 protocolVersion=2');
    expect(messages).toContain('agent_hello_v2 accepted=false reason=MISSING_TYPED_SCHEMA agentId=agent-1 organizationId=org-1 protocolVersion=2');
    expect(messages).not.toMatch(/secret-token|secret-key|secret-capability/);
  });
});

describe('Agent V1/V2 event coexistence', () => {
  const agents: any = { updateJobResult: jest.fn().mockResolvedValue({}) };
  const jobs: any = {
    get: jest.fn().mockResolvedValue({ queryId: 'q1' }),
    transition: jest.fn().mockResolvedValue({ changed: false }),
    complete: jest.fn().mockResolvedValue({ changed: false }),
  };
  const dispatcher: any = {
    isPending: jest.fn().mockImplementation((_jobId, _orgId, _agentId, queryId) => queryId === 'q1'), receive: jest.fn().mockReturnValue(true),
    fail: jest.fn().mockReturnValue(true), registerTransport: jest.fn(),
  };
  const gateway = new AgentsGateway(agents, jobs, dispatcher);
  const socket: any = { data: { organizationId: 'org-1', agentId: 'agent-1', v2Capable: true } };

  it('conserve le handler V1 sql_result', async () => {
    expect(await gateway.handleSqlResult(socket, { jobId: 'legacy', result: [{ value: 0 }] }))
      .toEqual({ status: 'received' });
    expect(agents.updateJobResult).toHaveBeenCalledWith('legacy', 'org-1', [{ value: 0 }], undefined);
  });
  it('négocie V2 uniquement avec un agent authentifié et capable', () => {
    const v1: any = { data: { organizationId: 'org-1', agentId: 'agent-1' } };
    expect(gateway.handleAgentHelloV2(v1, { protocolVersions: [1], capabilities: [] })).toEqual({ status: 'rejected' });
    expect(gateway.handleAgentHelloV2(v1, { protocolVersions: [1, 2], capabilities: ['query_parameters', 'typed_schema'] }))
      .toEqual({ status: 'accepted', protocolVersion: 2 });
    expect(v1.data.v2Capable).toBe(true);
  });
  it('rejette un agent V2 non authentifié et un queryId usurpé', async () => {
    expect(await gateway.handleQueryAcknowledgedV2({ data: {} } as any,
      { protocolVersion: 2, jobId: 'j1', queryId: 'q1', sequence: 1 })).toEqual({ status: 'rejected' });
    expect(await gateway.handleQueryAcknowledgedV2(socket,
      { protocolVersion: 2, jobId: 'j1', queryId: 'wrong', sequence: 1 })).toEqual({ status: 'rejected' });
  });
  it('borne une réponse V2 à la connexion agent et au tenant', async () => {
    await gateway.handleQueryResultV2(socket, { protocolVersion: 2, jobId: 'j1', queryId: 'q1',
      sequence: 1, error: 'failure' });
    expect(dispatcher.fail).toHaveBeenCalledWith('j1', 'org-1',
      'agent-1', 'q1', 1, expect.objectContaining({ code: 'SOURCE_UNAVAILABLE' }));
  });
});


describe('Agent V2 négocié — transport Gateway vers Dispatcher', () => {
  it('route seulement vers le socket capable et borne ACK/résultat', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    const agents: any = {
      validateAgentToken: jest.fn().mockResolvedValue({
        id: 'agent-1', organizationId: 'org-1', name: 'pilote' }),
      setAgentConnected: jest.fn(), setAgentDisconnected: jest.fn(),
      failActiveJobsForOrg: jest.fn().mockResolvedValue(undefined),
    };
    const jobs: any = { transition: jest.fn().mockResolvedValue({
      changed: true, job: { state: 'RUNNING' } }) };
    const gateway = new AgentsGateway(agents, jobs, dispatcher);
    const emits: any[] = [];
    const socket: any = {
      id: 'socket-1', handshake: { auth: { token: 'opaque' } }, data: {},
      join: jest.fn(), emit: jest.fn(),
    };
    (gateway as any).server = {
      sockets: new Map([['socket-1', socket]]),
      to: () => ({ emit: (name: string, payload: unknown) => emits.push({ name, payload }) }),
    };
    gateway.onModuleInit();
    await gateway.handleConnection(socket);
    expect(dispatcher.agentFor('org-1')).toBeUndefined();
    expect(gateway.handleAgentHelloV2(socket, { protocolVersions: [1, 2],
      capabilities: ['query_parameters', 'typed_schema'] })).toEqual({
      status: 'accepted', protocolVersion: 2 });
    expect(dispatcher.agentFor('org-1')).toBe('agent-1');
    const plan: any = { queryId: 'q1', requestId: 'r1',
      securityScope: { organizationId: 'org-1' },
      execution: { statement: 'SELECT 1', parameters: {} },
      limits: { maxRows: 1000, timeoutMs: 1000 } };
    const pending = dispatcher.execute(plan, 'j1');
    expect(emits[0].name).toBe('execute_query_v2');
    expect(await gateway.handleQueryAcknowledgedV2(socket,
      { protocolVersion: 2, jobId: 'j1', queryId: 'q1', sequence: 1 }))
      .toEqual({ status: 'received' });
    expect(await gateway.handleQueryResultV2(socket,
      { protocolVersion: 2, jobId: 'j1', queryId: 'q1', sequence: 1,
        status: 'success', rows: [{ value: '0.00' }] })).toEqual({ status: 'received' });
    await expect(pending).resolves.toEqual({ rows: [{ value: '0.00' }] });
    expect(await gateway.handleQueryResultV2(socket,
      { protocolVersion: 2, jobId: 'j1', queryId: 'q1', sequence: 1,
        status: 'success', rows: [{ value: '9.00' }] })).toEqual({ status: 'rejected' });
  });
});
