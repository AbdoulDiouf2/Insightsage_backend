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
import { TargetsModule } from './targets/targets.module';
import { BillingModule } from './billing/billing.module';
// import { AdminPanelModule } from './admin-panel/admin-panel.module'; // Désactivé (AdminJS)
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
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
    // Rate limiting global : 60 requêtes/minute par IP par défaut
    // Les endpoints sensibles surchargent cette valeur avec @Throttle()
    ThrottlerModule.forRoot([
      {
        ttl: 60000,  // fenêtre de 1 minute
        limit: 60,   // 60 requêtes max par IP par défaut
      },
    ]),
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
    TargetsModule,
    BillingModule,
    // AdminPanelModule, // Désactivé (AdminJS)
  ],
  providers: [
    // Global guards applied in order:
    // 1. ThrottlerGuard - Rate limiting (avant tout le reste)
    // 2. JwtAuthGuard  - Authentification (skipped for @Public() routes)
    // 3. TenantGuard   - Isolation multi-tenant
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
    // Global audit interceptor — logs every HTTP action to audit_logs
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule { }
