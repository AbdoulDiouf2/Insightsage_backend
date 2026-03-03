import { Controller, UseGuards } from '@nestjs/common';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';

@Controller('nlq')
@UseGuards(SubscriptionGuard)
@RequiresFeature('hasNlq')
export class NlqController { }
