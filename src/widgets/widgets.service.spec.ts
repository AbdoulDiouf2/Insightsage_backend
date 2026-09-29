import { Test, TestingModule } from '@nestjs/testing';
import { WidgetsService } from './widgets.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataBindingService } from './data-binding.service';
import { SemanticRegistryService } from '../data-engine/semantic/semantic-registry.service';

describe('WidgetsService', () => {
  let service: WidgetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetsService,
        DataBindingService,
        SemanticRegistryService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<WidgetsService>(WidgetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

it('does not expose connector metadata in catalog or enriched packs', async () => {
  const row = { id: 'k1', key: 'f01_ca_ht', name: 'CA HT', category: 'finance',
    defaultVizType: 'card', profiles: ['DAF'], direction: 'HIGHER_IS_BETTER',
    isActive: true, sqlSage100View: 'SECRET_VIEW', sqlSage100Tables: ['SECRET_TABLE'],
    dataBinding: null };
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
    kpiPack: { findMany: jest.fn().mockResolvedValue([{ name: 'daf', kpiKeys: ['f01_ca_ht'] }]) },
    kpiDefinition: { findMany: jest.fn().mockResolvedValue([row]) },
    widgetTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new WidgetsService(prisma,
    new DataBindingService(new SemanticRegistryService()));
  const catalog = await service.getStore('org-1');
  expect(JSON.stringify(catalog)).not.toMatch(/SECRET_VIEW|SECRET_TABLE|sqlSage/);
  expect(catalog.kpiPacks[0].kpis[0].key).toBe('f01_ca_ht');
});

it('exposes an inactive saved definition as disabled while removing it from active packs', async () => {
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
    kpiPack: { findMany: jest.fn().mockResolvedValue([{ kpiKeys: ['historical-key'] }]) },
    kpiDefinition: { findMany: jest.fn().mockResolvedValue([{
      id: 'k1', key: 'historical-key', name: 'Historical', category: 'finance',
      defaultVizType: 'card', profiles: [], direction: 'HIGHER_IS_BETTER',
      isActive: false, dataBinding: { kind: 'data_engine_v2', metric: 'missing' },
    }]) },
    widgetTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const catalog = await new WidgetsService(prisma,
    new DataBindingService(new SemanticRegistryService())).getStore('org-1');
  expect(catalog.kpiDefinitions[0]).toMatchObject({ isActive: false,
    dataBinding: { kind: 'unavailable' } });
  expect(catalog.kpiPacks[0].kpis).toEqual([]);
});
