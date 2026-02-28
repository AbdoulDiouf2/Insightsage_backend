import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
  ],
})
export class AppModule { }
