import { QueryCacheService } from './query-cache.service';

describe('QueryCacheService V2', () => {
  const previous = { key: process.env.DATA_ENGINE_V2_ENCRYPTION_KEY, env: process.env.NODE_ENV };
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  afterAll(() => {
    if (previous.key === undefined) delete process.env.DATA_ENGINE_V2_ENCRYPTION_KEY;
    else process.env.DATA_ENGINE_V2_ENCRYPTION_KEY = previous.key;
    if (previous.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.env;
  });
  it('purge les entrées expirées de façon mesurable', async () => {
    const prisma: any = { dataQueryCacheV2: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    } };
    const cache = new QueryCacheService(prisma);
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    try {
      expect(await cache.purgeExpired()).toBe(2);
      expect(prisma.dataQueryCacheV2.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { expiresAt: { lte: expect.any(Date) } },
      }));
    } finally {
      delete process.env.DATA_ENGINE_V2_ENABLED;
    }
  });
  it('chiffre, isole par tenant/version et respecte le TTL', async () => {
    const rows = new Map<string, any>();
    const key = (o: any) => `${o.organizationId}:${o.queryFingerprint}:${o.registryVersion}`;
    const prisma: any = { dataQueryCacheV2: {
      upsert: jest.fn().mockImplementation(async ({ create }) => rows.set(key(create),
        { ...create, createdAt: new Date() })),
      findUnique: jest.fn().mockImplementation(async ({ where }) =>
        rows.get(key(where.organizationId_queryFingerprint_registryVersion))),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    } };
    const cache = new QueryCacheService(prisma);
    const result: any = { queryId: 'q', status: 'success', schema: [], rows: [{ value: 0 }],
      meta: { rowCount: 1, generatedAt: 'x', queryExecutedAt: 'x', cache: 'none', truncated: false } };
    await cache.put('org-1', 'fp', 'v1', result, 60);
    expect(rows.get('org-1:fp:v1').resultCiphertext.toString()).not.toContain('value');
    expect((await cache.get('org-1', 'fp', 'v1'))?.rows).toEqual([{ value: 0 }]);
    expect(await cache.get('org-2', 'fp', 'v1')).toBeNull();
    expect(await cache.get('org-1', 'fp', 'v2')).toBeNull();
    rows.get('org-1:fp:v1').expiresAt = new Date(0);
    expect(await cache.get('org-1', 'fp', 'v1')).toBeNull();
  });
});
