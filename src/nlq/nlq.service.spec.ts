import { Test, TestingModule } from '@nestjs/testing';
import { NlqService } from './nlq.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('NlqService', () => {
  let service: NlqService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NlqService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NlqService>(NlqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
