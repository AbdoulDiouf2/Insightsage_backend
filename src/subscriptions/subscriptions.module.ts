import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { LicenseGuardianService } from './license-guardian.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, LicenseGuardianService],
  exports: [SubscriptionsService, LicenseGuardianService],
})
export class SubscriptionsModule { }
