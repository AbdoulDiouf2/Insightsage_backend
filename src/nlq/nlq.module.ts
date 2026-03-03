import { Module } from '@nestjs/common';
import { NlqController } from './nlq.controller';
import { NlqService } from './nlq.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [NlqController],
  providers: [NlqService],
})
export class NlqModule { }
