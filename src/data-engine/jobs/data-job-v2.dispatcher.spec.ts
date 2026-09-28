import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';

describe('DataJobV2Dispatcher — transport réel V2', () => {
  const plan: any = {
    queryId: 'q1', requestId: 'r1', securityScope: { organizationId: 'org-1' },
    execution: { statement: 'SELECT 1', parameters: {} },
    limits: { maxRows: 1000, timeoutMs: 10 },
  };
  it('refuse agent absent ou incapable sans repli V1', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    await expect(dispatcher.execute(plan, 'j1')).rejects.toMatchObject({ code: 'AGENT_OFFLINE' });
  });
  it('attend uniquement la réponse du bon agent, tenant, job et séquence', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    const send = jest.fn().mockReturnValue(true);
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send });
    const waiting = dispatcher.execute({ ...plan, limits: { ...plan.limits, timeoutMs: 1000 } }, 'j1');
    expect(send).toHaveBeenCalledWith('org-1', 'agent-1', expect.objectContaining({
      protocolVersion: 2, jobId: 'j1', sequence: 1 }));
    expect(dispatcher.receive('j1', 'org-2', 'agent-1', 'q1', 1, [{ value: '9' }])).toBe(false);
    expect(dispatcher.receive('j1', 'org-1', 'agent-2', 'q1', 1, [{ value: '9' }])).toBe(false);
    expect(dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 2, [{ value: '9' }])).toBe(false);
    expect(dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, [{ value: '0.00' }])).toBe(true);
    await expect(waiting).resolves.toEqual({ rows: [{ value: '0.00' }] });
    expect(dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, [])).toBe(false);
  });
  it('expire puis ignore le résultat tardif', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send: () => true });
    await expect(dispatcher.execute(plan, 'j1')).rejects.toMatchObject({ code: 'QUERY_TIMEOUT' });
    expect(dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, [{ value: '1' }])).toBe(false);
  });
  it('échoue explicitement lors de la déconnexion', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send: () => true });
    const waiting = dispatcher.execute({ ...plan, limits: { ...plan.limits, timeoutMs: 1000 } }, 'j2');
    dispatcher.disconnected('org-1', 'agent-1');
    await expect(waiting).rejects.toMatchObject({ code: 'AGENT_OFFLINE' });
  });
});
