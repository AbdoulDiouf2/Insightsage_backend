import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../src/prisma/prisma.service';
import { QueryCacheService } from '../src/data-engine/cache/query-cache.service';
import { DataJobV2Service } from '../src/data-engine/jobs/data-job-v2.service';
import { QueryResult } from '../src/data-engine/contracts/query-result';

const url = process.env.CHECKPOINT15_DATABASE_URL;
const isolated = (() => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgresql:' &&
      ['127.0.0.1', 'localhost'].includes(parsed.hostname) &&
      parsed.pathname.startsWith('/checkpoint15_');
  } catch { return false; }
})();
const suite = isolated ? describe : describe.skip;

suite('Data Engine V2 — PostgreSQL isolé après db push V1 et migration V2', () => {
  let pool: Pool;
  let prisma: PrismaService;
  let cache: QueryCacheService;
  let jobs: DataJobV2Service;
  const key = () => 'checkpoint15-' + randomUUID();
  const jobData = (organizationId: string, fingerprint: string) => ({
    organizationId, queryId: key(), requestId: key(), queryFingerprint: fingerprint,
    registryVersion: 'checkpoint15', permissionAction: 'read', permissionResource: 'data',
    dispatchDeadlineAt: new Date(Date.now() + 60000),
  });
  const plan = (organizationId: string, fingerprint: string): any => ({
    queryId: key(), requestId: key(), queryFingerprint: fingerprint, registryVersion: 'checkpoint15',
    securityScope: { organizationId },
    metric: { requiredPermission: { action: 'read', resource: 'data' } },
  });
  const result: QueryResult = {
    queryId: 'checkpoint15-result', status: 'success',
    schema: [{ key: 'value', type: 'number', nullable: false, role: 'metric' }],
    rows: [{ value: 0, secret: 'ERP_CHECKPOINT_SECRET' }],
    meta: { rowCount: 1, generatedAt: new Date().toISOString(),
      queryExecutedAt: new Date().toISOString(), cache: 'none', truncated: false },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService;
    await prisma.$connect();
    cache = new QueryCacheService(prisma);
    jobs = new DataJobV2Service(prisma, cache);
  });
  afterAll(async () => {
    if (!isolated) return;
    await pool.query("DELETE FROM data_query_cache_v2 WHERE \"queryFingerprint\" LIKE 'checkpoint15-%'");
    await pool.query("DELETE FROM data_jobs_v2 WHERE \"queryFingerprint\" LIKE 'checkpoint15-%'");
    await prisma.$disconnect();
    await pool.end();
  });

  it('conserve les fixtures V1 et expose colonnes, tables, FK et index V2', async () => {
    const legacy = await pool.query("SELECT status, result FROM agent_jobs WHERE id='checkpoint-v1-job'");
    expect(legacy.rows).toEqual([{ status: 'COMPLETED', result: { value: 1 } }]);
    const columns = await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='organizations' AND column_name='dataTimezone') OR table_name IN ('data_jobs_v2','data_query_cache_v2'))");
    expect(columns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'organizations', column_name: 'dataTimezone', data_type: 'text' }),
      expect.objectContaining({ table_name: 'data_jobs_v2', column_name: 'resultCiphertext', data_type: 'bytea' }),
      expect.objectContaining({ table_name: 'data_query_cache_v2', column_name: 'resultCiphertext', data_type: 'bytea' }),
    ]));
    const indexes = await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('data_jobs_v2','data_query_cache_v2')");
    expect(indexes.rows.find(x => x.indexname === 'data_jobs_v2_one_active_fingerprint')?.indexdef)
      .toContain("WHERE (state = ANY");
    expect(indexes.rows.some(x => x.indexname.startsWith('data_query_cache_v2_organizationId_queryFingerprint'))).toBe(true);
    const fk = await pool.query("SELECT conrelid::regclass::text AS table_name, confrelid::regclass::text AS referenced FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('data_jobs_v2','data_query_cache_v2')");
    expect(fk.rows).toEqual(expect.arrayContaining([
      { table_name: 'data_jobs_v2', referenced: 'organizations' },
      { table_name: 'data_query_cache_v2', referenced: 'organizations' },
    ]));
  });

  it('applique exactement l’unicité des jobs actifs et garde les historiques', async () => {
    const fingerprint = key();
    const first = await prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) });
    await expect(prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) }))
      .rejects.toMatchObject({ code: 'P2002' });
    await prisma.dataJobV2.update({ where: { id: first.id }, data: { state: 'RUNNING' } });
    await expect(prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) }))
      .rejects.toMatchObject({ code: 'P2002' });
    const other = await prisma.dataJobV2.create({ data: jobData('checkpoint-org-b', fingerprint) });
    expect(other.organizationId).toBe('checkpoint-org-b');
    await prisma.dataJobV2.update({ where: { id: first.id }, data: { state: 'COMPLETED' } });
    const second = await prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) });
    await prisma.dataJobV2.update({ where: { id: second.id }, data: { state: 'FAILED' } });
    const third = await prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) });
    await prisma.dataJobV2.update({ where: { id: third.id }, data: { state: 'COMPLETED' } });
    const fourth = await prisma.dataJobV2.create({ data: jobData('checkpoint-org-a', fingerprint) });
    expect(fourth.id).not.toBe(first.id);
    expect(await prisma.dataJobV2.count({ where: { organizationId: 'checkpoint-org-a',
      queryFingerprint: fingerprint, state: 'COMPLETED' } })).toBe(2);
    await prisma.dataJobV2.delete({ where: { id: fourth.id } });
    await prisma.dataJobV2.delete({ where: { id: other.id } });
    await prisma.dataJobV2.delete({ where: { id: third.id } });
    await prisma.dataJobV2.delete({ where: { id: second.id } });
    await prisma.dataJobV2.delete({ where: { id: first.id } });
  });

  it('déduplique deux créations simultanées et isole les tenants', async () => {
    const fingerprint = key();
    const [a, b] = await Promise.all([
      jobs.createOrGet(plan('checkpoint-org-a', fingerprint)),
      jobs.createOrGet(plan('checkpoint-org-a', fingerprint)),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.job.id).toBe(b.job.id);
    const other = await jobs.createOrGet(plan('checkpoint-org-b', fingerprint));
    expect(other.created).toBe(true);
    expect(other.job.id).not.toBe(a.job.id);
    await expect(jobs.get(a.job.id, 'checkpoint-org-b')).rejects.toThrow('introuvable');
  });

  it('rend les transitions concurrentes atomiques et protège un état terminal', async () => {
    const created = await jobs.createOrGet(plan('checkpoint-org-a', key()));
    const [a, b] = await Promise.all([
      jobs.transition(created.job.id, 'checkpoint-org-a', ['PENDING'], 'DISPATCHED'),
      jobs.transition(created.job.id, 'checkpoint-org-a', ['PENDING'], 'CANCELLED'),
    ]);
    expect([a.changed, b.changed].filter(Boolean)).toHaveLength(1);
    const terminal = await jobs.transition(created.job.id, 'checkpoint-org-a',
      ['DISPATCHED'], 'CANCELLED');
    expect(terminal.job.state).toBe('CANCELLED');
    const late = await jobs.transition(created.job.id, 'checkpoint-org-a',
      ['RUNNING'], 'COMPLETED');
    expect(late.changed).toBe(false);
    expect((await jobs.get(created.job.id, 'checkpoint-org-a')).state).toBe('CANCELLED');
  });

  it('chiffre le cache en base, isole tenant et version, expire et purge', async () => {
    const fingerprint = key();
    await cache.put('checkpoint-org-a', fingerprint, 'v1', result, 1);
    const raw = await pool.query('SELECT "resultCiphertext","resultIv","expiresAt" FROM data_query_cache_v2 WHERE "organizationId"=$1 AND "queryFingerprint"=$2', ['checkpoint-org-a', fingerprint]);
    expect(raw.rows).toHaveLength(1);
    expect(Buffer.from(raw.rows[0].resultCiphertext).toString('utf8')).not.toContain('ERP_CHECKPOINT_SECRET');
    expect(raw.rows[0].resultIv.length).toBe(12);
    expect((await cache.get('checkpoint-org-a', fingerprint, 'v1'))?.rows).toEqual(result.rows);
    expect(await cache.get('checkpoint-org-b', fingerprint, 'v1')).toBeNull();
    expect(await cache.get('checkpoint-org-a', fingerprint, 'v2')).toBeNull();
    await cache.put('checkpoint-org-b', fingerprint, 'v1', result, 1);
    expect(await prisma.dataQueryCacheV2.count({ where: { queryFingerprint: fingerprint } })).toBe(2);
    await pool.query('UPDATE data_query_cache_v2 SET "expiresAt"=now()-interval \'1 second\' WHERE "queryFingerprint"=$1', [fingerprint]);
    expect(await cache.get('checkpoint-org-a', fingerprint, 'v1')).toBeNull();
    expect(await cache.purgeExpired()).toBeGreaterThanOrEqual(2);
    expect(await prisma.dataQueryCacheV2.count({ where: { queryFingerprint: fingerprint } })).toBe(0);
  });

  it('respecte le commit concurrent et le rollback sur la contrainte partielle', async () => {
    let fingerprint = key();
    const c1 = await pool.connect(); const c2 = await pool.connect();
    const insert = 'INSERT INTO data_jobs_v2 ("id","organizationId","queryId","requestId","queryFingerprint","registryVersion","permissionAction","permissionResource","dispatchDeadlineAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval \'1 minute\')';
    const args = (id: string) => [id, 'checkpoint-org-a', id, id, fingerprint, 'v1', 'read', 'data'];
    try {
      await c1.query('BEGIN');
      await c1.query(insert, args(key()));
      await c2.query('BEGIN');
      const blocked = c2.query(insert, args(key())).then(() => 'inserted', e => e.code);
      await new Promise(resolve => setTimeout(resolve, 100));
      await c1.query('COMMIT');
      expect(await blocked).toBe('23505');
      await c2.query('ROLLBACK');
      fingerprint = key();
      await c1.query('BEGIN');
      const first = key();
      await c1.query(insert, args(first));
      await c2.query('BEGIN');
      const released = c2.query(insert, args(key())).then(() => 'inserted', e => e.code);
      await new Promise(resolve => setTimeout(resolve, 100));
      await c1.query('ROLLBACK');
      expect(await released).toBe('inserted');
      await c2.query('COMMIT');
    } finally {
      await c1.query('ROLLBACK').catch(() => undefined);
      await c2.query('ROLLBACK').catch(() => undefined);
      c1.release(); c2.release();
    }
  });
});
