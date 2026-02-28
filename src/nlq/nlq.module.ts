import { Module } from '@nestjs/common';
import { NlqController } from './nlq.controller';
import { NlqService } from './nlq.service';

@Module({
  controllers: [NlqController],
  providers: [NlqService],
})
export class NlqModule {}
