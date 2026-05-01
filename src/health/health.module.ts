import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthMonitorService } from './health-monitor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, NotificationsModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthMonitorService],
})
export class HealthModule {}
