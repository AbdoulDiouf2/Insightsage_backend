import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataEngineModule } from '../src/data-engine/data-engine.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataJobV2Dispatcher } from '../src/data-engine/jobs/data-job-v2.dispatcher';
import { QueryPlannerService } from '../src/data-engine/planner/query-planner.service';
import { QueryFailure } from '../src/data-engine/contracts/query-error';
import { user } from './fixtures/data-engine-v2/synthetic-query';
import entries from './fixtures/data-engine-v2/revenue-ht-accounting.json';

describe('revenue_ht — harness comptable fictif, hors Sage', () => {
  let app: INestApplication;
  let dispatcher: DataJobV2Dispatcher;
  const jobs = new Map<string, any>();
  const cache = new Map<string, any>();
  const cacheKey = (x: any) => `${x.organizationId}:${x.queryFingerprint}:${x.registryVersion}`;
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ dataTimezone: 'Africa/Dakar' }) },
    dataQueryCacheV2: {
      findUnique: jest.fn().mockImplementation(async ({ where }) =>
        cache.get(cacheKey(where.organizationId_queryFingerprint_registryVersion)) ?? null),
      upsert: jest.fn().mockImplementation(async ({ create, update }) => {
        cache.set(cacheKey(create), { ...create, ...update, createdAt: new Date() });
      }),
    },
    dataJobV2: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const existing = [...jobs.values()].find(row => row.organizationId === data.organizationId &&
          row.queryFingerprint === data.queryFingerprint &&
          ['PENDING', 'DISPATCHED', 'RUNNING'].includes(row.state));
        if (existing) throw { code: 'P2002' };
        const row = { id: `pilot-${jobs.size + 1}`, state: 'PENDING', version: 0, ...data };
        jobs.set(row.id, row); return row;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) {
          const row = jobs.get(where.id);
          return row?.organizationId === where.organizationId ? row : null;
        }
        return [...jobs.values()].find(row => row.organizationId === where.organizationId &&
          row.queryFingerprint === where.queryFingerprint &&
          (where.state?.in ? where.state.in.includes(row.state) : row.state === where.state)) ?? null;
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
  const fromRequest = (period: any, comparison?: any, dimensions?: string[]) => ({
    version: '2', metric: 'revenue_ht', period, ...(comparison ? { comparison } : {}),
    ...(dimensions ? { dimensions } : {}),
  });
  const absolute = (from: string, to: string) => ({
    type: 'absolute', from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z`,
  });
  const asMoney = (cents: number) => (cents / 100).toFixed(2);
  const compute = async (plan: any) => {
    const { periodFrom, periodTo } = plan.execution.parameters;
    if (!plan.execution.statement.includes('[ca_ht]') ||
        plan.execution.statement.includes('[cg_num] LIKE') ||
        !plan.execution.statement.includes('@periodFrom') ||
        !plan.execution.statement.includes('@periodTo'))
      throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Plan pilote invalide');
    if (periodFrom === '2025-09-01') await new Promise(resolve => setTimeout(resolve, 50));
    const found = entries.filter(row => row.account.startsWith('70') &&
      row.date >= periodFrom && row.date < periodTo);
    if (plan.dimensions.length) {
      const months = [...new Set(found.map(row => row.date.slice(0, 7)))].sort();
      return { rows: months.map(month => {
        const group = found.filter(row => row.date.startsWith(month));
        return { month, value: asMoney(group.reduce((sum, row) =>
          sum + (row.sense === 'credit' ? row.cents : -row.cents), 0)),
          __source_row_count: group.length };
      }) };
    }
    return { rows: [{ value: found.length ? asMoney(found.reduce((sum, row) =>
      sum + (row.sense === 'credit' ? row.cents : -row.cents), 0)) : null,
      __source_row_count: found.length }] };
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString('base64');
    const module = await Test.createTestingModule({ imports: [DataEngineModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    const planner = module.get(QueryPlannerService);
    const planAtFixedTime = planner.plan.bind(planner);
    jest.spyOn(planner, 'plan').mockImplementation((query, identity, zone) =>
      planAtFixedTime(query, identity, zone, new Date('2026-09-28T12:00:00Z')));
    dispatcher = module.get(DataJobV2Dispatcher);
    dispatcher.setSimulatorForTest({ execute: compute });
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: any) => {
      req.user = user(req.headers['x-test-org'] || 'org-1'); next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    delete process.env.DATA_ENGINE_V2_ENABLED;
    delete process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED;
    delete process.env.DATA_ENGINE_V2_ENCRYPTION_KEY;
  });

  it.each([
    ['mois courant', { type: 'relative', value: 'current_month' }, '300.00'],
    ['trimestre courant', { type: 'relative', value: 'current_quarter' }, '470.00'],
    ['année courante', { type: 'relative', value: 'current_year' }, '470.00'],
    ['plage absolue', absolute('2026-08-01', '2026-09-01'), '50.00'],
    ['zéro réel', absolute('2026-06-01', '2026-07-01'), '0.00'],
  ])('%s donne le montant comptable contrôlé', async (_label, period, expected) => {
    const response = await request(app.getHttpServer()).post('/api/data/query')
      .send(fromRequest(period)).expect(201);
    expect(response.body.result.status).toBe('success');
    expect(response.body.result.rows[0].value).toBe(expected);
  });
  it('distingue période vide et erreur source', async () => {
    const empty = await request(app.getHttpServer()).post('/api/data/query')
      .send(fromRequest(absolute('2026-05-01', '2026-06-01'))).expect(201);
    expect(empty.body.result.status).toBe('empty');
    expect(empty.body.result.rows).toEqual([]);
    dispatcher.setSimulatorForTest({ execute: async () => {
      throw new QueryFailure('SOURCE_UNAVAILABLE', 'Source fictive indisponible');
    } });
    try {
      await request(app.getHttpServer()).post('/api/data/query')
        .send(fromRequest(absolute('2026-04-01', '2026-05-01'))).expect(503);
    } finally { dispatcher.setSimulatorForTest({ execute: compute }); }
  });
  it('groupe par mois et applique les deux comparaisons', async () => {
    const grouped = await request(app.getHttpServer()).post('/api/data/query')
      .send(fromRequest({ type: 'relative', value: 'current_year' }, undefined, ['month'])).expect(201);
    expect(grouped.body.result.rows).toEqual([
      { month: '2026-06', value: '0.00' }, { month: '2026-07', value: '120.00' },
      { month: '2026-08', value: '50.00' }, { month: '2026-09', value: '300.00' },
    ]);
    const previous = await request(app.getHttpServer()).post('/api/data/query')
      .send(fromRequest({ type: 'relative', value: 'current_month' },
        { type: 'previous_period' })).expect(201);
    expect(previous.body.result.rows[0]).toEqual({ value: '300.00', previous_value: '50.00' });
    const year = await request(app.getHttpServer()).post('/api/data/query')
      .send(fromRequest({ type: 'relative', value: 'current_month' },
        { type: 'previous_year' })).expect(201);
    expect(year.body.result.rows[0]).toEqual({ value: '300.00', previous_value: '100.00' });
  });
  it('sépare cache hit, tenant et requêtes simultanées', async () => {
    const payload = fromRequest(absolute('2026-07-01', '2026-08-01'));
    const miss = await request(app.getHttpServer()).post('/api/data/query').send(payload).expect(201);
    expect(miss.body.result.meta.cache).toBe('none');
    const first = await request(app.getHttpServer()).post('/api/data/query').send(payload).expect(201);
    expect(first.body.result.meta.cache).toBe('backend');
    const other = await request(app.getHttpServer()).post('/api/data/query')
      .set('x-test-org', 'org-2').send(payload).expect(201);
    expect(other.body.result.meta.cache).toBe('none');
    const concurrentPayload = fromRequest(absolute('2025-09-01', '2025-10-01'));
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/data/query').send(concurrentPayload),
      request(app.getHttpServer()).post('/api/data/query').send(concurrentPayload),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.status, b.body.status].sort()).toEqual(['completed', 'pending']);
  });
});
