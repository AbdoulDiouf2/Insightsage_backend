import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';

describe('V2 certification dispatch envelope', () => {
  it('sends a versioned certification marker and leaves business dispatch unmarked', async () => {
    const dispatcher = new DataJobV2Dispatcher();
    const send = jest.fn().mockReturnValue(true);
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send });
    const base: any = { queryId: 'q1', requestId: 'r1',
      securityScope: { organizationId: 'org-1' },
      execution: { statement: 'SELECT 1', parameters: {} },
      limits: { maxRows: 1000, timeoutMs: 1000 } };
    const campaign = dispatcher.execute({ ...base, executionPurpose: 'certification',
      certificationCampaign: { id: 'campaign-1', version: 1 },
      registryVersion: 'registry-1' }, 'cert-job');
    expect(send.mock.calls[0][2]).toMatchObject({
      executionPurpose: 'certification',
      certificationCampaign: { id: 'campaign-1', version: 1 },
      registryVersion: 'registry-1',
    });
    dispatcher.receive('cert-job', 'org-1', 'agent-1', 'q1', 1, []);
    await campaign;
    const business = dispatcher.execute(base, 'business-job');
    expect(send.mock.calls[1][2]).not.toHaveProperty('executionPurpose');
    expect(send.mock.calls[1][2]).not.toHaveProperty('certificationCampaign');
    dispatcher.receive('business-job', 'org-1', 'agent-1', 'q1', 1, []);
    await business;
  });
});
