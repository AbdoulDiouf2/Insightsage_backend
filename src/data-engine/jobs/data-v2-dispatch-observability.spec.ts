import { Logger } from '@nestjs/common';
import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';

describe('Data Engine V2 dispatch observability', () => {
  afterEach(() => jest.restoreAllMocks());

  it('correlates dispatch with Agent without logging SQL, dates, request secrets or results', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const dispatcher = new DataJobV2Dispatcher();
    const send = jest.fn().mockReturnValue(true);
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send });
    const plan: any = { queryId: 'q1', requestId: 'secret-request', metric: { key: 'revenue_ht' },
      securityScope: { organizationId: 'org-1' },
      execution: { statement: 'SELECT secret_sql', parameters: {
        periodFrom: '2022-01-01', periodTo: '2022-02-01', password: 'secret-password',
      } }, limits: { maxRows: 1000, timeoutMs: 1000 } };

    const waiting = dispatcher.execute(plan, 'j1');
    expect(send.mock.calls[0][2]).toMatchObject({
      statement: plan.execution.statement, parameters: plan.execution.parameters,
    });
    const messages = log.mock.calls.map(([message]) => String(message));
    expect(messages).toContain('data_v2 dispatch {"queryId":"q1","jobId":"j1","metric":"revenue_ht","agentId":"agent-1","organizationId":"org-1","sequence":1}');
    expect(messages.join(' ')).not.toMatch(/secret-request|secret_sql|secret-password|2022-01-01|2022-02-01/);
    dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, [{ value: 'secret-result' }]);
    await waiting;
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret-result');
  });
});
