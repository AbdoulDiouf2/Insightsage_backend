import { Module, Global } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { AuditLogService } from './audit-log.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [LogsController],
  providers: [LogsService, AuditLogService],
  exports: [AuditLogService], // Export so other modules can log events
})
export class LogsModule {}
