import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../logs/audit-log.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,     // Requis pour PermissionsGuard (UsersService)
    AuditLogModule,  // Requis pour AuditLogService
  ],
  controllers: [BillingController],
  providers: [BillingService, StripeWebhookService],
  exports: [BillingService],
})
export class BillingModule {}
