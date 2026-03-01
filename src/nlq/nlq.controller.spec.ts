import { Test, TestingModule } from '@nestjs/testing';
import { NlqController } from './nlq.controller';
import { NlqService } from './nlq.service';
import { UsersService } from '../users/users.service';
import { Reflector } from '@nestjs/core';

describe('NlqController', () => {
  let controller: NlqController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NlqController],
      providers: [
        {
          provide: NlqService,
          useValue: {},
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: Reflector,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<NlqController>(NlqController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
