import { Module } from '@nestjs/common';
import { BugsController } from './bugs/bugs.controller';
import { BugsService } from './bugs/bugs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BugsController],
  providers: [BugsService]
})
export class BugsModule { }
