import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicController } from './public.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PublicController],
})
export class PublicModule {}
