import { Test } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataEngineModule } from '../src/data-engine/data-engine.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataJobV2Dispatcher } from '../src/data-engine/jobs/data-job-v2.dispatcher';
import { SemanticRegistryService } from '../src/data-engine/semantic/semantic-registry.service';
import { DataBindingService } from '../src/widgets/data-binding.service';

const TEST_ORG = 'b51d935f-07c5-4a8e-b1ca-9fd5bdccda44';
const OTHER_ORG = 'a617e1b8-3b7e-4ef4-9751-93f411315f49';
const TEST_ADMIN = 'db06b13b-cf20-4897-99d6-8018d2f02fad';
const period = { type: 'absolute', from: '2022-01-01T00:00:00.000Z',
  to: '2022-02-01T00:00:00.000Z' };
const caseRequest = { version: '2', metric: 'revenue_ttc', dimensions: [], period };

describe('V2 certification route, real planner/job/dispatcher with a fake Agent socket', () => {
  let app: INestApplication;
  let dispatcher: DataJobV2Dispatcher;
  let registry: SemanticRegistryService;
  const jobs = new Map<string, any>();
  const sent: Array<Record<string, any>> = [];
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ dataTimezone: 'Africa/Dakar' }) },
    dataQueryCacheV2: { findUnique: jest.fn(), upsert: jest.fn() },
    kpiDefinition: { update: jest.fn(), upsert: jest.fn() },
    widget: { update: jest.fn() },
    dataJobV2: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const row = { id: `cert-job-${jobs.size + 1}`, state: 'PENDING', version: 0, ...data };
        jobs.set(row.id, row); return row;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) {
          const row = jobs.get(where.id);
          return row?.organizationId === where.organizationId ? row : null;
        }
        return [...jobs.values()].find(row => row.organizationId === where.organizationId &&
          row.queryFingerprint === where.queryFingerprint && where.state?.in?.includes(row.state)) ?? null;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => jobs.get(where.id) ?? null),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        const row = jobs.get(where.id);
        if (!row || row.organizationId !== where.organizationId || row.version !== where.version ||
            !where.state.in.includes(row.state)) return { count: 0 };
        Object.assign(row, data, { version: row.version + 1 }); return { count: 1 };
      }),
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID = TEST_ORG;
    process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID = TEST_ADMIN;
    process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString('base64');
    const module = await Test.createTestingModule({ imports: [DataEngineModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    dispatcher = module.get(DataJobV2Dispatcher);
    registry = module.get(SemanticRegistryService);
    dispatcher.registerTransport({
      agentFor: org => org === TEST_ORG ? 'agent-v2-1' : undefined,
      send: (org, agentId, payload) => {
        sent.push({ org, agentId, ...payload });
        const parameters = payload.parameters as Record<string, string>;
        const grouped = String(payload.statement).includes('GROUP BY');
        setImmediate(() => dispatcher.receive(payload.jobId as string, org, agentId,
          payload.queryId as string, payload.sequence as number,
          [{ value: '100.00', __source_row_count: 2,
            ...(grouped ? { month: parameters.periodFrom.slice(0, 7) } : {}) }]));
        return true;
      },
    });
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: any) => {
      const org = req.headers['x-test-org'] === 'other' ? OTHER_ORG : TEST_ORG;
      const permissions = [{ action: 'read', resource: 'data' }];
      if (req.headers['x-test-admin'] !== 'no')
        permissions.push({ action: 'execute', resource: 'data_certification' });
      req.user = { id: req.headers['x-test-user'] === 'other' ? 'other-user' : TEST_ADMIN,
        organizationId: org, userRoles: [{ role: {
        permissions: permissions.map(permission => ({ permission })) } }] };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    for (const name of ['DATA_ENGINE_V2_ENABLED', 'DATA_ENGINE_V2_CERTIFICATION_ENABLED',
      'DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID', 'DATA_ENGINE_V2_ENCRYPTION_KEY'])
      delete process.env[name];
    delete process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID;
  });

  it('keeps the normal query and widget binding closed to revenue_ttc', async () => {
    const result = await request(app.getHttpServer()).post('/api/data/query')
      .send(caseRequest).expect(422);
    expect(result.body.code).toBe('NOT_CONFIGURED');
    expect(() => new DataBindingService(registry).validate({ kind: 'data_engine_v2',
      metric: 'revenue_ttc' }, 'card')).toThrow();
    expect(sent).toHaveLength(0);
  });

  it('requires an explicit organization and the dedicated permission', async () => {
    await request(app.getHttpServer()).post('/api/data/certification/query')
      .set('x-test-org', 'other').send(caseRequest).expect(403);
    await request(app.getHttpServer()).post('/api/data/certification/query')
      .set('x-test-admin', 'no').send(caseRequest).expect(403);
    await request(app.getHttpServer()).post('/api/data/certification/query')
      .set('x-test-user', 'other').send(caseRequest).expect(403);
    expect(sent).toHaveLength(0);
  });

  it('is disabled unless its own kill switch and pinned user are configured', async () => {
    const old = process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED;
    process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED = 'false';
    try {
      await request(app.getHttpServer()).post('/api/data/certification/query')
        .send(caseRequest).expect(422);
    } finally { process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED = old; }
    expect(sent).toHaveLength(0);
  });

  it('rejects metrics, periods, dimensions, SQL and source outside the campaign', async () => {
    for (const body of [
      { ...caseRequest, metric: 'revenue_ht' },
      { ...caseRequest, metric: 'unknown' },
      { ...caseRequest, period: { ...period, to: '2022-04-01T00:00:00.000Z' } },
      { ...caseRequest, dimensions: ['month'] },
      { ...caseRequest, sql: 'SELECT secret' },
      { ...caseRequest, source: 'other' },
      { ...caseRequest, column: 'secret' },
      { ...caseRequest, executionPurpose: 'certification' },
      { ...caseRequest, certificationCampaign: { id: 'finance_general_source_validation_v1' } },
      { ...caseRequest, organizationId: OTHER_ORG },
    ]) await request(app.getHttpServer()).post('/api/data/certification/query')
      .send(body).expect(({ status }) => expect([400, 422]).toContain(status));
    expect(sent).toHaveLength(0);
  });

  it('dispatches the compiled plan through Agent V2, persists a private job and never promotes', async () => {
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    try {
      const result = await request(app.getHttpServer()).post('/api/data/certification/query')
        .send(caseRequest).expect(201);
      expect(result.body).toMatchObject({ status: 'completed', result: {
        status: 'success', meta: { executionPurpose: 'certification', sourceRowCount: 2, cache: 'none' },
        rows: [{ value: '100.00' }] } });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ org: TEST_ORG, agentId: 'agent-v2-1',
        protocolVersion: 2, resourceId: 'sage100:finance_general',
        executionPurpose: 'certification',
        certificationCampaign: { id: 'finance_general_source_validation_v1', version: 1 },
        registryVersion: registry.version,
        parameters: { periodFrom: '2022-01-01', periodTo: '2022-02-01' } });
      expect(sent[0].statement).toContain('SUM([ca_ttc])');
      expect(sent[0].statement).not.toContain('2022-01-01');
      const job = [...jobs.values()][0];
      expect(job).toMatchObject({ organizationId: TEST_ORG, agentId: 'agent-v2-1',
        state: 'COMPLETED', permissionAction: 'execute', permissionResource: 'data_certification' });
      expect(job.requestId).toMatch(/^certification:finance_general_source_validation_v1:/);
      expect(prisma.dataQueryCacheV2.findUnique).not.toHaveBeenCalled();
      expect(prisma.dataQueryCacheV2.upsert).not.toHaveBeenCalled();
      expect(prisma.kpiDefinition.update).not.toHaveBeenCalled();
      expect(prisma.kpiDefinition.upsert).not.toHaveBeenCalled();
      expect(prisma.widget.update).not.toHaveBeenCalled();
      expect(registry.metric('revenue_ttc').certification.state).toBe('awaiting_source_validation');
      const messages = logs.mock.calls.flat().join(' ');
      expect(messages).toContain('purpose=certification');
      expect(messages).not.toMatch(/100\.00|SUM\(\[ca_ttc\]\)|2022-01-01/);
      await request(app.getHttpServer()).get(`/api/data/jobs/${job.id}`)
        .set('x-test-org', 'other').expect(404);
      await request(app.getHttpServer()).get(`/api/data/jobs/${job.id}`)
        .set('x-test-admin', 'no').expect(403);
    } finally { logs.mockRestore(); }
  });

  it('uses the same V2 result validation for a grouped candidate', async () => {
    const response = await request(app.getHttpServer()).post('/api/data/certification/query')
      .send({ ...caseRequest, metric: 'gross_margin', dimensions: ['month'] }).expect(201);
    expect(response.body.result).toMatchObject({ status: 'success',
      rows: [{ month: '2022-01', value: '100.00' }],
      meta: { executionPurpose: 'certification', sourceRowCount: 2 } });
    expect(sent.at(-1)?.statement).toContain('GROUP BY [annee_mois]');
    expect(registry.metric('gross_margin').certification.state).toBe('awaiting_source_validation');
  });
});
