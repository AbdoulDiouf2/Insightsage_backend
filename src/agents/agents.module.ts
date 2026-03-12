import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../logs/audit-log.module';
import { AgentsGateway } from './agents.gateway';
import { SqlSecurityService } from './sql-security.service';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, AuditLogModule, UsersModule, SubscriptionsModule, RedisModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsGateway, SqlSecurityService],
  exports: [AgentsService, AgentsGateway, SqlSecurityService],
})
export class AgentsModule { }
