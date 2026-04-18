import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuditInterceptor } from './audit/audit.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { WidgetsModule } from './widgets/widgets.module';
import { NlqModule } from './nlq/nlq.module';
import { LogsModule } from './logs/logs.module';
import { AdminModule } from './admin/admin.module';
import { RolesModule } from './roles/roles.module';
import { HealthModule } from './health/health.module';
import { AgentsModule } from './agents/agents.module';
import { AuditLogModule } from './logs/audit-log.module';
import { MailerModule } from './mailer/mailer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TargetsModule } from './targets/targets.module';
import { BillingModule } from './billing/billing.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { BugsModule } from './bugs/bugs.module';
import { StorageModule } from './storage/storage.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ClaudeModule } from './claude/claude.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    RedisModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? '.env.test'
          : process.env.NODE_ENV === 'production'
            ? '.env.prod'
            : ['.env.dev', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    ClaudeModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    SubscriptionsModule,
    OnboardingModule,
    DashboardsModule,
    WidgetsModule,
    NlqModule,
    LogsModule,
    AdminModule,
    RolesModule,
    HealthModule,
    AgentsModule,
    AuditLogModule,
    MailerModule,
    NotificationsModule,
    TargetsModule,
    BillingModule,
    BugsModule,
    StorageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule { }
