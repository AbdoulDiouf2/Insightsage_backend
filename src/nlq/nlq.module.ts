import { Module } from '@nestjs/common';
import { NlqService } from './nlq.service';
import { NlqController } from './nlq.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentsModule } from '../agents/agents.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, AgentsModule, SubscriptionsModule, UsersModule],
  controllers: [NlqController],
  providers: [NlqService],
  exports: [NlqService],
})
export class NlqModule { }
