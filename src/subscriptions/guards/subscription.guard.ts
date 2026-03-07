import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseGuardianService } from '../license-guardian.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class SubscriptionGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private licenseGuardian: LicenseGuardianService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredFeature = this.reflector.getAllAndOverride<keyof SubscriptionPlan>(
            REQUIRES_FEATURE_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredFeature) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!user || !user.organizationId) {
            return false;
        }

        const hasAccess = await this.licenseGuardian.canAccessFeature(user.organizationId, requiredFeature);

        if (!hasAccess) {
            throw new ForbiddenException(
                `Accès refusé : Cette fonctionnalité n'est pas incluse dans votre forfait actuel.`,
            );
        }

        return true;
    }
}
