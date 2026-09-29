import { Test, TestingModule } from '@nestjs/testing';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';
import { UsersService } from '../users/users.service';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards';

describe('WidgetsController', () => {
  let controller: WidgetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetsController],
      providers: [
        {
          provide: WidgetsService,
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
    }).overrideGuard(PermissionsGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<WidgetsController>(WidgetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
