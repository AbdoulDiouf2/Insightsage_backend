import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataEngineModule } from '../src/data-engine/data-engine.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SemanticRegistryService } from '../src/data-engine/semantic/semantic-registry.service';
import { DataJobV2Dispatcher } from '../src/data-engine/jobs/data-job-v2.dispatcher';
import { QueryFailure } from '../src/data-engine/contracts/query-error';
import { registerSynthetic, user } from './fixtures/data-engine-v2/synthetic-query';

describe('Data Engine V2 contract (simulated connector)', () => {
  let app: INestApplication;
  const cacheRows = new Map<string, any>();
  const jobs = new Map<string, any>();
  const cacheKey = (x: any) => `${x.organizationId}:${x.queryFingerprint}:${x.registryVersion}`;
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ dataTimezone: 'Africa/Dakar' }) },
    dataQueryCacheV2: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => cacheRows.get(cacheKey(where.organizationId_queryFingerprint_registryVersion)) ?? null),
      upsert: jest.fn().mockImplementation(async ({ create, update }) => {
        const key = cacheKey(create);
        cacheRows.set(key, { ...cacheRows.get(key), ...create, ...update, createdAt: new Date() });
      }),
    },
    dataJobV2: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const row = { id: `j${jobs.size + 1}`, state: 'PENDING', version: 0, ...data };
        jobs.set(row.id, row);
        return row;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) {
          const row = jobs.get(where.id);
          return row?.organizationId === where.organizationId ? row : null;
        }
        return [...jobs.values()].find(row => row.organizationId === where.organizationId &&
          row.queryFingerprint === where.queryFingerprint &&
          where.state.in.includes(row.state)) ?? null;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => jobs.get(where.id) ?? null),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        const row = jobs.get(where.id);
        if (!row || row.organizationId !== where.organizationId || row.version !== where.version ||
            !where.state.in.includes(row.state)) return { count: 0 };
        Object.assign(row, data, { version: row.version + 1 });
        return { count: 1 };
      }),
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const module = await Test.createTestingModule({ imports: [DataEngineModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    registerSynthetic(module.get(SemanticRegistryService));
    module.get(DataJobV2Dispatcher).setSimulatorForTest({
      execute: async plan => {
        const value = plan.analyticalFilters[0]?.value;
        if (value === 'error') throw new QueryFailure('SOURCE_UNAVAILABLE', 'Source simulée indisponible');
        return { rows: value === 'empty' ? [] : [{ value: 0 }] };
      },
    });
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: any) => {
      req.user = user(req.headers['x-test-org'] || 'org-1');
      if (req.headers['x-test-no-permission']) req.user.userRoles = [];
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    delete process.env.DATA_ENGINE_V2_ENABLED;
    delete process.env.DATA_ENGINE_V2_ENCRYPTION_KEY;
  });
  const base = { version: '2', metric: 'synthetic_amount' };

  it('rejette SQL libre et métrique inconnue', async () => {
    await request(app.getHttpServer()).post('/api/data/query').send({ ...base, sql: 'SELECT 1' }).expect(400);
    await request(app.getHttpServer()).post('/api/data/query').send({ ...base, scope: { organizationId: 'org-2' } }).expect(400);
    const unknown = await request(app.getHttpServer()).post('/api/data/query').send({ ...base, metric: 'unknown' }).expect(422);
    expect(unknown.body.code).toBe('NOT_CONFIGURED');
  });
  it('reste inactif sans activation explicite', async () => {
    process.env.DATA_ENGINE_V2_ENABLED = 'false';
    try {
      await request(app.getHttpServer()).post('/api/data/query').send(base).expect(422);
    } finally {
      process.env.DATA_ENGINE_V2_ENABLED = 'true';
    }
  });
  it('retourne zéro, vide et erreur comme états distincts', async () => {
    const zero = await request(app.getHttpServer()).post('/api/data/query').send(base).expect(201);
    expect(zero.body.result.status).toBe('success');
    expect(zero.body.result.rows[0].value).toBe(0);
    const empty = await request(app.getHttpServer()).post('/api/data/query').send({
      ...base, filters: [{ field: 'region', operator: 'eq', value: 'empty' }],
    }).expect(201);
    expect(empty.body.result.status).toBe('empty');
    expect(empty.body.result.rows).toEqual([]);
    const failed = await request(app.getHttpServer()).post('/api/data/query').send({
      ...base, filters: [{ field: 'region', operator: 'eq', value: 'error' }],
    }).expect(503);
    expect(failed.body.code).toBe('SOURCE_UNAVAILABLE');
  });
  it('exécute une comparaison avec le connecteur simulé', async () => {
    const response = await request(app.getHttpServer()).post('/api/data/query').send({
      ...base, period: { type: 'absolute', from: '2026-09-01T00:00:00Z',
        to: '2026-10-01T00:00:00Z' }, comparison: { type: 'previous_period' },
    }).expect(201);
    expect(response.body.result.status).toBe('success');
    expect(response.body.result.rows[0]).toEqual({ value: 0, previous_value: 0 });
    expect(response.body.result.schema).toContainEqual(expect.objectContaining({
      key: 'previous_value', role: 'comparison',
    }));
  });
  it('isole le cache et les jobs par tenant', async () => {
    const first = await request(app.getHttpServer()).post('/api/data/query').send(base).expect(201);
    expect(first.body.result.meta.cache).toBe('backend');
    const other = await request(app.getHttpServer()).post('/api/data/query').set('x-test-org', 'org-2').send(base).expect(201);
    expect(other.body.result.meta.cache).toBe('none');
    const jobId = [...jobs.values()].find(row => row.organizationId === 'org-1')?.id;
    await request(app.getHttpServer()).get(`/api/data/jobs/${jobId}`).set('x-test-org', 'org-2').expect(404);
    await request(app.getHttpServer()).get(`/api/data/jobs/${jobId}`).set('x-test-no-permission', '1').expect(403);
    await request(app.getHttpServer()).post('/api/data/query').set('x-test-no-permission', '1').send(base).expect(403);
  });
});
