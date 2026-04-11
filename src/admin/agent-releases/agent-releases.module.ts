import { Module } from '@nestjs/common';
import { AgentReleasesController } from './agent-releases.controller';
import { AgentReleasesService } from './agent-releases.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { LogsModule } from '../../logs/logs.module';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [PrismaModule, StorageModule, LogsModule, AuthModule, UsersModule, RedisModule],
  controllers: [AgentReleasesController],
  providers: [AgentReleasesService],
  exports: [AgentReleasesService],
})
export class AgentReleasesModule {}
