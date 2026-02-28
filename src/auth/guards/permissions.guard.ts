import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PermissionRequirement,
} from '../decorators/permissions.decorator';
import { UsersService } from '../../users/users.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionRequirement[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no specific permissions are required, allow access
    if (!requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Fetch the full user with nested UserRoles -> Role -> RolePermissions -> Permission
    const dbUser = await this.usersService.findByIdSafe(user.id);
    if (!dbUser || !dbUser.userRoles) return false;

    // Flatten all permissions granted to this user across all their assigned roles
    const userPermissions = new Set<string>();

    for (const ur of dbUser.userRoles) {
      if (!ur.role || !ur.role.permissions) continue;

      // If the user has a "superadmin" or direct "manage:all" role, grant all access immediately
      const isSuperAdmin = ur.role.permissions.some(
        (rp) =>
          rp.permission.action === 'manage' && rp.permission.resource === 'all',
      );
      if (isSuperAdmin) return true;

      for (const rp of ur.role.permissions) {
        userPermissions.add(
          `${rp.permission.action}:${rp.permission.resource}`,
        );
      }
    }

    // Check if the user possesses ALL the required permissions for this route
    return requiredPermissions.every((reqPerm) =>
      userPermissions.has(`${reqPerm.action}:${reqPerm.resource}`),
    );
  }
}
