import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
// import { AdminPanelModule } from './admin-panel/admin-panel.module'; // Désactivé (AdminJS)
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? '.env.test'
          : process.env.NODE_ENV === 'production'
            ? '.env.prod'
            : ['.env.dev', '.env'],
    }),
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
    // AdminPanelModule, // Désactivé (AdminJS)
  ],
  providers: [
    // Global guards applied in order:
    // 1. JwtAuthGuard - Authenticates user (skipped for @Public() routes)
    // 2. TenantGuard - Ensures multi-tenant isolation
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
