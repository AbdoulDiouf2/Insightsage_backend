import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * TenantGuard - Ensures multi-tenant isolation
 * 
 * This guard verifies that authenticated users have a valid organizationId
 * and injects it into the request for downstream use.
 * 
 * Applied globally to enforce tenant isolation across all protected routes.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user (unauthenticated), let JwtAuthGuard handle it
    if (!user) {
      return true;
    }

    // Superadmins (InsightSage developers) can access cross-tenant
    if (this.isSuperAdmin(user)) {
      return true;
    }

    // Regular users MUST have an organizationId
    if (!user.organizationId) {
      throw new ForbiddenException(
        'User is not associated with any organization.',
      );
    }

    // Inject organizationId into request for easy access in controllers/services
    request.organizationId = user.organizationId;

    return true;
  }

  private isSuperAdmin(user: any): boolean {
    if (!user.userRoles) return false;
    
    return user.userRoles.some((ur: any) => {
      if (!ur.role?.permissions) return false;
      return ur.role.permissions.some(
        (rp: any) =>
          rp.permission?.action === 'manage' &&
          rp.permission?.resource === 'all',
      );
    });
  }
}
