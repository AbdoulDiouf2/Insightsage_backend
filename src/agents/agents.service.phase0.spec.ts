import { JobStatus } from '@prisma/client';
import { AgentsService } from './agents.service';

describe('AgentsService Phase 0', () => {
  const make = () => {
    const service = Object.create(AgentsService.prototype) as AgentsService;
    const job = { id: 'job-1', organizationId: 'org-1', status: JobStatus.FAILED, result: null };
    const prisma = {
      agentJob: {
        findUnique: jest.fn().mockResolvedValue(job),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (service as any).prisma = prisma;
    return { service, prisma, job };
  };

  it('ne remplace pas un job terminal après une réponse tardive', async () => {
    const { service, prisma, job } = make();
    expect(await service.updateJobResult('job-1', 'org-1', [{ value: 42 }])).toEqual(job);
    expect(prisma.agentJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
      }),
    }));
  });

  it('conserve un vrai zéro et distingue un résultat vide', () => {
    const service = Object.create(AgentsService.prototype) as AgentsService;
    expect((service as any).transformResult([{ value: 0 }]).value).toBe(0);
    expect((service as any).transformResult([])).toEqual({ data: [], count: 0 });
  });
  it('enregistre puis efface les erreurs observées par le heartbeat V1', async () => {
    const { service, prisma } = make();
    const agent = { id: 'agent-1', errorCount: 0, lastError: null, rowsSynced: BigInt(0), lastSync: null, pendingCommand: null };
    (prisma as any).agent = {
      findUnique: jest.fn().mockResolvedValue(agent),
      update: jest.fn().mockResolvedValue(agent),
    };
    await service.heartbeatV1('agent-1', 'org-1', { status: 'online', errorCount: 2, lastError: 'SQL indisponible' });
    expect((prisma as any).agent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCount: 2, lastError: 'SQL indisponible' }),
    }));
    await service.heartbeatV1('agent-1', 'org-1', { status: 'online', errorCount: 0 });
    expect((prisma as any).agent.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCount: 0, lastError: null }),
    }));
  });

});
