import { Test, TestingModule } from '@nestjs/testing';
import { DashboardsService } from './dashboards.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardsService', () => {
  let service: DashboardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        {
          provide: PrismaService,
          useValue: {
            dashboard: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DashboardsService>(DashboardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
