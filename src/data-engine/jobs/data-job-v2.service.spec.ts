import { DataJobV2Service } from './data-job-v2.service';

describe('DataJobV2Service', () => {
  const plan = { queryId: 'q1', requestId: 'r1', queryFingerprint: 'fingerprint',
    registryVersion: '1', securityScope: { organizationId: 'org-1' },
    metric: { requiredPermission: { action: 'read', resource: 'data' } } } as any;
  it('déduplique deux créations concurrentes avec la contrainte DB', async () => {
    let active: any;
    const prisma: any = { dataJobV2: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        if (active) throw { code: 'P2002' };
        active = { id: 'j1', ...data, state: 'PENDING', version: 0 };
        return active;
      }),
      findFirst: jest.fn().mockImplementation(async () => active),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    const [a, b] = await Promise.all([service.createOrGet(plan), service.createOrGet(plan)]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.job.id).toBe(b.job.id);
  });
  it('retrouve le gagnant terminé pendant la lecture après collision', async () => {
    const completed: any = { id: 'j1', state: 'COMPLETED', organizationId: 'org-1',
      queryFingerprint: 'fingerprint', resultExpiresAt: new Date(Date.now() + 60000) };
    const prisma: any = { dataJobV2: {
      create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(completed),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    expect(await service.createOrGet(plan)).toEqual({ job: completed, created: false });
    expect(prisma.dataJobV2.findFirst).toHaveBeenCalledTimes(2);
  });
  it('ne change pas un état terminal sur réponse tardive', async () => {
    const job: any = { id: 'j1', organizationId: 'org-1', state: 'TIMED_OUT', version: 2 };
    const prisma: any = { dataJobV2: {
      findFirst: jest.fn().mockResolvedValue(job),
      updateMany: jest.fn(),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    expect((await service.transition('j1', 'org-1', ['RUNNING'], 'COMPLETED')).changed).toBe(false);
    expect(prisma.dataJobV2.updateMany).not.toHaveBeenCalled();
  });
  it('écrit une transition atomique bornée par tenant, état et version', async () => {
    const job: any = { id: 'j1', organizationId: 'org-1', state: 'DISPATCHED', version: 3 };
    const prisma: any = { dataJobV2: {
      findFirst: jest.fn().mockResolvedValue(job), findUnique: jest.fn().mockResolvedValue(job),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    expect((await service.transition('j1', 'org-1', ['DISPATCHED'], 'RUNNING')).changed).toBe(true);
    expect(prisma.dataJobV2.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1', version: 3,
        state: { in: ['DISPATCHED'] } }),
    }));
  });
  it('ignore une réponse provenant d’un autre agent', async () => {
    const job: any = { id: 'j1', organizationId: 'org-1', agentId: 'trusted',
      state: 'RUNNING', version: 1 };
    const prisma: any = { dataJobV2: {
      findFirst: jest.fn().mockResolvedValue(job), updateMany: jest.fn(),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    expect((await service.transition('j1', 'org-1', ['RUNNING'], 'FAILED', 'impostor')).changed).toBe(false);
    expect(prisma.dataJobV2.updateMany).not.toHaveBeenCalled();
  });
  it('classe les deadlines persistées sans réémission SQL', async () => {
    const prisma: any = { dataJobV2: {
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 3 }),
    } };
    const service = new DataJobV2Service(prisma, {} as any);
    process.env.DATA_ENGINE_V2_ENABLED = 'true';
    try {
      expect(await service.expireDueJobs()).toEqual({ dispatch: 1, execution: 2 });
      expect(prisma.dataJobV2.updateMany).toHaveBeenCalledTimes(3);
    } finally {
      delete process.env.DATA_ENGINE_V2_ENABLED;
    }
  });
  it('refuse la lecture d’un autre tenant', async () => {
    const prisma: any = { dataJobV2: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new DataJobV2Service(prisma, {} as any);
    await expect(service.get('j1', 'org-2')).rejects.toThrow('introuvable');
  });
});
