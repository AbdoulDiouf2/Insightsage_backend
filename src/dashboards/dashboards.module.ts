import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../logs/audit-log.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, AuditLogModule, UsersModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
