import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { CockpitGateway } from './cockpit.gateway';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentReleasesModule } from './agent-releases/agent-releases.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, NotificationsModule, AgentReleasesModule],
  controllers: [AdminController],
  providers: [AdminService, CockpitGateway],
})
export class AdminModule { }
