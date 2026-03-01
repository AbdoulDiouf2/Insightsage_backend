import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
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
// AdminJS désactivé temporairement (incompatibilité ESM/CJS avec NestJS)
// import { AdminPanelModule } from './admin-panel/admin-panel.module';
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
    // AdminPanelModule, // Désactivé - utiliser Prisma Studio à la place
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
  ],
})
export class AppModule {}
