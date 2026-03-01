import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from './audit-log.module';

@Module({
  imports: [PrismaModule, UsersModule, AuditLogModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule { }
