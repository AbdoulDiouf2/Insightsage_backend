import { Logger } from '@nestjs/common';
import { DataJobV2Dispatcher } from './data-job-v2.dispatcher';

const statement = 'SELECT TOP (1000) CONVERT(varchar(64), SUM([ca_ht])) AS [value], COUNT_BIG(*) AS [__source_row_count] FROM [dbo].[VW_FINANCE_GENERAL] WHERE [dt_jour] >= @periodFrom AND [dt_jour] < @periodTo';

describe('Gate 1 dispatch evidence', () => {
  afterEach(() => jest.restoreAllMocks());

  it('records exactly the SQL and typed dates sent to the Agent, without request secrets', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const dispatcher = new DataJobV2Dispatcher();
    const send = jest.fn().mockReturnValue(true);
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send });
    const plan: any = { queryId: 'q1', requestId: 'secret-request', metric: { key: 'revenue_ht' },
      securityScope: { organizationId: 'org-1' },
      execution: { statement, parameters: { periodFrom: '2022-01-01', periodTo: '2022-02-01' } },
      limits: { maxRows: 1000, timeoutMs: 1000 } };

    const waiting = dispatcher.execute(plan, 'j1');
    const payload = send.mock.calls[0][2];
    expect(payload.statement).toBe(statement);
    expect(payload.parameters).toEqual(plan.execution.parameters);
    const evidence = log.mock.calls.map(([message]) => String(message)).find(message => message.startsWith('gate1_v2 dispatch '));
    expect(evidence).toBeDefined();
    expect(JSON.parse(evidence!.slice('gate1_v2 dispatch '.length))).toEqual({
      queryId: 'q1', jobId: 'j1', metric: 'revenue_ht', agentId: 'agent-1', organizationId: 'org-1',
      sequence: 1, statement, parameters: { periodFrom: { transportType: 'string', agentSqlType: 'DATE', value: '2022-01-01' },
        periodTo: { transportType: 'string', agentSqlType: 'DATE', value: '2022-02-01' } },
    });
    expect(evidence).not.toContain('secret-request');
    dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, []);
    await waiting;
  });

  it('never records arbitrary SQL or parameters from a malformed pilot plan', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const dispatcher = new DataJobV2Dispatcher();
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send: () => true });
    const plan: any = { queryId: 'q1', requestId: 'r1', metric: { key: 'revenue_ht' },
      securityScope: { organizationId: 'org-1' },
      execution: { statement: 'SELECT secret_sql', parameters: { password: 'secret-password' } },
      limits: { maxRows: 1000, timeoutMs: 1000 } };

    const waiting = dispatcher.execute(plan, 'j1');
    expect(warn.mock.calls[0][0]).toContain('dispatch_evidence_unavailable');
    expect([...log.mock.calls, ...warn.mock.calls].flat().join(' ')).not.toMatch(/secret_sql|secret-password/);
    dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, []);
    await waiting;
  });

  it('does not log SQL for other metrics', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const dispatcher = new DataJobV2Dispatcher();
    dispatcher.registerTransport({ agentFor: () => 'agent-1', send: () => true });
    const plan: any = { queryId: 'q1', requestId: 'r1', metric: { key: 'other_metric' },
      securityScope: { organizationId: 'org-1' },
      execution: { statement: 'SELECT secret_sql', parameters: { password: 'secret-password' } },
      limits: { maxRows: 1000, timeoutMs: 1000 } };
    const waiting = dispatcher.execute(plan, 'j1');
    expect(log).not.toHaveBeenCalled();
    dispatcher.receive('j1', 'org-1', 'agent-1', 'q1', 1, []);
    await waiting;
  });
});
