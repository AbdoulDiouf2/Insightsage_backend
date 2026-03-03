import { SetMetadata } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';

export const REQUIRES_FEATURE_KEY = 'requires_feature';
export const RequiresFeature = (feature: keyof SubscriptionPlan) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
