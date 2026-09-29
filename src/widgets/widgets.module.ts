import { Module } from '@nestjs/common';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { DataEngineModule } from '../data-engine/data-engine.module';
import { DataBindingService } from './data-binding.service';

@Module({
  imports: [PrismaModule, UsersModule, DataEngineModule],
  controllers: [WidgetsController],
  providers: [WidgetsService, DataBindingService],
  exports: [WidgetsService, DataBindingService],
})
export class WidgetsModule {}
