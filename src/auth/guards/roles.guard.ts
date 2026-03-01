import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard - Checks if user has required role(s)
 * 
 * Complementary to PermissionsGuard. Use when you want to restrict
 * access based on role names rather than granular permissions.
 * 
 * Example: @Roles('daf', 'owner') - Only DAF or Owner can access
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User not authenticated.');
    }

    // Extract user's role names
    const userRoleNames = this.getUserRoleNames(user);

    // Superadmin bypasses all role checks
    if (userRoleNames.includes('superadmin')) {
      return true;
    }

    // Check if user has at least one of the required roles
    const hasRole = requiredRoles.some((role) =>
      userRoleNames.includes(role.toLowerCase()),
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }

  private getUserRoleNames(user: any): string[] {
    if (!user.userRoles || !Array.isArray(user.userRoles)) {
      return [];
    }

    return user.userRoles
      .filter((ur: any) => ur.role?.name)
      .map((ur: any) => ur.role.name.toLowerCase());
  }
}
