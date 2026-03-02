import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { DatasourceController } from './datasource.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LogsModule } from '../logs/logs.module';
import { AuthModule } from '../auth/auth.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [PrismaModule, LogsModule, AuthModule, AgentsModule],
  controllers: [OnboardingController, DatasourceController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
