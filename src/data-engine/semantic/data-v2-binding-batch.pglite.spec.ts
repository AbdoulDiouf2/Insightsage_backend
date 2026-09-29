import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const source = readFileSync(join(process.cwd(), 'prisma/release/data-v2-binding-batch.sql'), 'utf8');
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const binding = (metric: string) => ({ kind: 'data_engine_v2', metric,
  query: { dimensions: [] }, presentation: { shape: 'scalar' } });
const item = (key: string, before: unknown = null, after: unknown = binding(key)) => ({
  key, name: `Synthetic ${key}`, visualization: 'card', before, after,
});
const manifest = (...entries: unknown[]) => JSON.stringify({ version: 1, entries });

describe('transactional batch rollout on isolated in-memory PostgreSQL', () => {
  let db: PGlite;
  const run = async (action: string, entries: unknown[], expectedDatabase = 'postgres') => {
    const sql = source.replace(/^\\set ON_ERROR_STOP on\r?\n/m, '')
      .replace(/:'expected_database'/g, quote(expectedDatabase))
      .replace(/:'action'/g, quote(action))
      .replace(/:'manifest'/g, quote(manifest(...entries)));
    try { await db.exec(sql); }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
  };
  const snapshot = async () => (await db.query(`SELECT key, "dataBinding" FROM kpi_definitions ORDER BY key`)).rows;
  const related = async () => ({
    widgets: (await db.query('SELECT * FROM widgets ORDER BY id')).rows,
    dashboards: (await db.query('SELECT * FROM dashboards ORDER BY id')).rows,
  });

  beforeEach(async () => {
    db = new PGlite();
    expect((await db.query('SELECT current_database() AS name')).rows[0].name).toBe('postgres');
    await db.exec(`CREATE TABLE kpi_definitions (
      key text PRIMARY KEY, name text NOT NULL, "defaultVizType" text NOT NULL,
      "isActive" boolean NOT NULL, "dataBinding" jsonb NULL);
      CREATE TABLE dashboards (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE widgets (id text PRIMARY KEY, "dashboardId" text REFERENCES dashboards(id),
        exposure text, config jsonb NOT NULL);
      INSERT INTO kpi_definitions VALUES
        ('a','Synthetic a','card',true,NULL),
        ('b','Synthetic b','card',true,NULL),
        ('c','Synthetic c','card',true,NULL),
        ('inactive','Synthetic inactive','card',false,NULL);
      INSERT INTO dashboards VALUES ('d1','Synthetic dashboard');
      INSERT INTO widgets VALUES ('w1','d1','a','{"kpiKey":"a"}'),
        ('w2','d1','b','{"kpiKey":"b"}');`);
  });
  afterEach(async () => { await db.close(); });

  it('binds two keys atomically, is idempotent, and rolls back idempotently', async () => {
    const entries = [item('a'), item('b')];
    const beforeRelated = await related();
    await run('bind', entries);
    expect(await snapshot()).toEqual([
      { key: 'a', dataBinding: binding('a') }, { key: 'b', dataBinding: binding('b') },
      { key: 'c', dataBinding: null }, { key: 'inactive', dataBinding: null },
    ]);
    const bound = await snapshot();
    await run('bind', entries);
    expect(await snapshot()).toEqual(bound);
    await run('unbind', entries);
    expect((await snapshot()).every(row => row.dataBinding === null)).toBe(true);
    await run('unbind', entries);
    expect((await snapshot()).every(row => row.dataBinding === null)).toBe(true);
    expect(await related()).toEqual(beforeRelated);
  });

  it('refuses a different existing binding and rolls back a prior entry', async () => {
    await db.query('UPDATE kpi_definitions SET "dataBinding"=$1 WHERE key=$2',
      [binding('other'), 'b']);
    const before = await snapshot();
    await expect(run('bind', [item('a'), item('b')])).rejects.toThrow(/Unexpected existing binding/);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['absent key', item('missing')],
    ['inactive key', item('inactive')],
    ['wrong name', { ...item('b'), name: 'Wrong' }],
    ['wrong visualization', { ...item('b'), visualization: 'line' }],
  ])('refuses %s and rolls back the entire lot', async (_label, bad) => {
    const before = await snapshot();
    const beforeRelated = await related();
    await expect(run('bind', [item('a'), bad])).rejects.toThrow(/definition mismatch/);
    expect(await snapshot()).toEqual(before);
    expect(await related()).toEqual(beforeRelated);
  });

  it('checks expected prior state and refuses wrong database or malformed manifest', async () => {
    const before = await snapshot();
    await expect(run('bind', [item('a', binding('old'))])).rejects.toThrow(/Unexpected existing binding/);
    await expect(run('bind', [item('a')], 'cockpit')).rejects.toThrow(/Wrong database/);
    await expect(run('bind', [item('a'), item('a')])).rejects.toThrow(/duplicated/);
    expect(await snapshot()).toEqual(before);
  });

  it('refuses rollback if a bound value changed since rollout', async () => {
    const entries = [item('a'), item('b')];
    await run('bind', entries);
    await db.query('UPDATE kpi_definitions SET "dataBinding"=$1 WHERE key=$2',
      [binding('other'), 'b']);
    const before = await snapshot();
    await expect(run('unbind', entries)).rejects.toThrow(/Unexpected existing binding/);
    expect(await snapshot()).toEqual(before);
  });
});
