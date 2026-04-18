import { Global, Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
