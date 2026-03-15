import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FlutterwaveWebhookService } from './flutterwave-webhook.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../logs/audit-log.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,     // Requis pour PermissionsGuard (UsersService)
    AuditLogModule,  // Requis pour AuditLogService
    MailerModule,    // Requis pour FlutterwaveWebhookService + BillingSchedulerService
  ],
  controllers: [BillingController],
  providers: [BillingService, FlutterwaveWebhookService, BillingSchedulerService],
  exports: [BillingService],
})
export class BillingModule {}
