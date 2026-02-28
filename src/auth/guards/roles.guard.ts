import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true; // No specific role required, pass
        }

        const { user } = context.switchToHttp().getRequest();

        if (!user || (!user.role && !user.roles)) {
            return false; // No user or undefined roles
        }

        // We assume the user has a `role` property (as defined in our schema)
        // Adjust logic if `user.roles` is an array.
        const userRoles = Array.isArray(user.role) ? user.role : [user.role];

        return requiredRoles.some((role) => userRoles.includes(role));
    }
}
