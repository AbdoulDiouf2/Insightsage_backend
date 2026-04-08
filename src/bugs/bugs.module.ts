import { Module } from '@nestjs/common';
import { BugsController } from './bugs/bugs.controller';
import { BugsService } from './bugs/bugs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule],
  controllers: [BugsController],
  providers: [BugsService]
})
export class BugsModule { }
