import { Global, Module } from '@nestjs/common';
import { AiRouterService } from './ai-router.service';
import { LocalLlmService } from './local-llm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ClaudeModule } from '../claude/claude.module';

@Global()
@Module({
  imports: [PrismaModule, ClaudeModule],
  providers: [AiRouterService, LocalLlmService],
  exports: [AiRouterService],
})
export class AiModule {}
