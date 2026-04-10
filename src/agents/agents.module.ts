import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentV1Controller } from './agent-v1.controller';
import { AgentsService } from './agents.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../logs/audit-log.module';
import { AgentsGateway } from './agents.gateway';
import { SqlSecurityService } from './sql-security.service';
import { AgentTokenGuard } from './guards/agent-token.guard';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuditLogModule, UsersModule, SubscriptionsModule, RedisModule, NotificationsModule],
  controllers: [AgentsController, AgentV1Controller],
  providers: [AgentsService, AgentsGateway, SqlSecurityService, AgentTokenGuard],
  exports: [AgentsService, AgentsGateway, SqlSecurityService],
})
export class AgentsModule { }
