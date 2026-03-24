import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PermissionRequirement,
} from '../decorators/permissions.decorator';
import { UsersService } from '../../users/users.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import type { RedisClientType } from 'redis';

const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
    @Inject(REDIS_CLIENT) private redis: RedisClientType,
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

    const userPermissions = await this.getUserPermissions(user.id);
    if (userPermissions === null) return false;

    // superadmin shortcut
    if (userPermissions.has('manage:all')) return true;

    // Check if the user possesses ALL the required permissions for this route
    return requiredPermissions.every((reqPerm) =>
      userPermissions.has(`${reqPerm.action}:${reqPerm.resource}`),
    );
  }

  /**
   * Récupère les permissions depuis le cache Redis ou la DB.
   * Cache key : `perms:{userId}` — TTL 5 minutes.
   */
  private async getUserPermissions(userId: string): Promise<Set<string> | null> {
    const cacheKey = `perms:${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return new Set<string>(JSON.parse(cached));
      }
    } catch {
      // Redis indisponible → fallback DB sans bloquer
    }

    // Cache miss — charger depuis la DB
    const dbUser = await this.usersService.findByIdSafe(userId);
    if (!dbUser || !dbUser.userRoles) return null;

    const permissions = new Set<string>();

    for (const ur of dbUser.userRoles) {
      if (!ur.role?.permissions) continue;
      for (const rp of ur.role.permissions) {
        permissions.add(`${rp.permission.action}:${rp.permission.resource}`);
      }
    }

    // Mettre en cache
    try {
      await this.redis.set(cacheKey, JSON.stringify([...permissions]), {
        EX: CACHE_TTL_SECONDS,
      });
    } catch {
      // Échec silencieux — la requête continue sans cache
    }

    return permissions;
  }
}
