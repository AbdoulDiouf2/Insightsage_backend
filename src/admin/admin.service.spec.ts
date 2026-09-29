import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataBindingService } from '../widgets/data-binding.service';
import { AuditLogService } from '../logs/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiRouterService } from '../ai/ai-router.service';
import { ConfigService } from '@nestjs/config';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: PrismaService;
  let bindings: DataBindingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DataBindingService, useValue: { validate: jest.fn() } },
        { provide: AuditLogService, useValue: {} },
        { provide: MailerService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: AiRouterService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            organization: { create: jest.fn(), findUnique: jest.fn() },
            user: { create: jest.fn() },
            role: { findFirst: jest.fn() },
            $transaction: jest.fn((cb) =>
              cb({ organization: {}, user: {}, role: {} }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
    bindings = module.get<DataBindingService>(DataBindingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('keeps admin source metadata while validating a semantic binding', async () => {
    const binding = { kind: 'data_engine_v2' as const, metric: 'revenue_ht' };
    jest.spyOn(bindings, 'validate').mockReturnValue(binding);
    (prisma as any).kpiDefinition = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => data),
    };
    const result = await service.createKpiDefinition({ key: 'test-key', name: 'Test',
      category: 'finance', defaultVizType: 'card', sqlSage100View: 'VIEW_INTERNAL',
      dataBinding: binding });
    expect(bindings.validate).toHaveBeenCalledWith(binding, 'card');
    expect(result).toMatchObject({ sqlSage100View: 'VIEW_INTERNAL', dataBinding: binding });
  });
});
