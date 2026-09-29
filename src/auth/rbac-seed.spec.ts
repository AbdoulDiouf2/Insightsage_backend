import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  seedRbac,
} from '../../prisma/rbac-seed';
import { SecurityScopeService } from '../data-engine/planner/security-scope.service';
import { PermissionsGuard } from './guards/permissions.guard';

describe('RBAC Data Engine V2 seed', () => {
  it('grants read:data to global daf and owner, not controller or analyst', () => {
    const readData = { action: 'read', resource: 'data' };
    expect(DEFAULT_PERMISSIONS).toContainEqual(
      expect.objectContaining(readData),
    );
    for (const name of ['daf', 'owner']) {
      const role = DEFAULT_ROLES.find((candidate) => candidate.name === name)!;
      expect(role.isSystem).toBe(true);
      expect(role.permissions).toContainEqual(readData);
    }
    for (const name of ['controller', 'analyst', 'superadmin']) {
      expect(
        DEFAULT_ROLES.find((candidate) => candidate.name === name)!.permissions,
      ).not.toContainEqual(readData);
    }
    expect(
      DEFAULT_ROLES.find((role) => role.name === 'superadmin')!.permissions,
    ).toEqual([{ action: 'manage', resource: 'all' }]);
  });

  it('adds missing associations once and preserves existing permissions on repeated runs', async () => {
    const permissions = new Map<string, any>([
      [
        'legacy:feature',
        {
          id: 'legacy',
          action: 'legacy',
          resource: 'feature',
          description: 'Preserved',
        },
      ],
    ]);
    const roles = new Map<string, any>();
    const links = new Set<string>(['custom:legacy']);
    const client: any = {
      permission: {
        upsert: jest.fn(async ({ where, update, create }) => {
          const key = `${where.action_resource.action}:${where.action_resource.resource}`;
          const existing = permissions.get(key);
          if (existing) Object.assign(existing, update);
          else permissions.set(key, { ...create, id: key });
        }),
        findMany: jest.fn(async () => [...permissions.values()]),
      },
      role: {
        upsert: jest.fn(async ({ where, update, create }) => {
          const existing = roles.get(where.name);
          if (existing) Object.assign(existing, update);
          else roles.set(where.name, { ...create, id: where.name });
          return roles.get(where.name);
        }),
      },
      rolePermission: {
        upsert: jest.fn(async ({ where }) => {
          const { roleId, permissionId } = where.roleId_permissionId;
          links.add(`${roleId}:${permissionId}`);
        }),
      },
    };
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      await seedRbac(client);
      const first = {
        permissions: permissions.size,
        roles: roles.size,
        links: links.size,
      };
      expect(links.has('daf:read:data')).toBe(true);
      expect(links.has('owner:read:data')).toBe(true);
      expect(links.has('controller:read:data')).toBe(false);
      expect(links.has('analyst:read:data')).toBe(false);
      expect(links.has('superadmin:read:data')).toBe(false);
      await seedRbac(client);
      expect({
        permissions: permissions.size,
        roles: roles.size,
        links: links.size,
      }).toEqual(first);
      expect(permissions.get('legacy:feature').description).toBe('Preserved');
      expect(links.has('custom:legacy')).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('keeps manage:all effective without removing tenant scope', () => {
    const scope = new SecurityScopeService();
    const superadmin = {
      id: 'admin',
      organizationId: 'org-A',
      userRoles: [
        {
          role: {
            permissions: [
              { permission: { action: 'manage', resource: 'all' } },
            ],
          },
        },
      ],
    };
    expect(scope.hasPermission(superadmin, 'read', 'data')).toBe(true);
    expect(scope.resolve(superadmin)).toEqual({ organizationId: 'org-A' });
    expect(() =>
      scope.resolve({ ...superadmin, organizationId: null }),
    ).toThrow();
  });

  it('allows superadmin through PermissionsGuard using manage:all', async () => {
    const reflector: any = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([{ action: 'read', resource: 'data' }]),
    };
    const users: any = {
      findByIdSafe: jest.fn().mockResolvedValue({
        userRoles: [
          {
            role: {
              permissions: [
                { permission: { action: 'manage', resource: 'all' } },
              ],
            },
          },
        ],
      }),
    };
    const redis: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    };
    const guard = new PermissionsGuard(reflector, users, redis);
    const context: any = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'admin', organizationId: 'org-A' } }),
      }),
    };
    expect(await guard.canActivate(context)).toBe(true);
    expect(users.findByIdSafe).toHaveBeenCalledWith('admin');
  });
});
