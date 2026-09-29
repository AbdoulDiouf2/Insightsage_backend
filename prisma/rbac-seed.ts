import { PrismaClient } from '@prisma/client';

export const DEFAULT_PERMISSIONS = [
  // Dashboard & Widgets
  { action: 'read', resource: 'dashboards', description: 'See dashboards' },
  {
    action: 'write',
    resource: 'dashboards',
    description: 'Create and edit dashboards',
  },
  {
    action: 'delete',
    resource: 'dashboards',
    description: 'Delete dashboards',
  },
  { action: 'read', resource: 'widgets', description: 'See widgets' },
  {
    action: 'write',
    resource: 'widgets',
    description: 'Create and edit widgets',
  },
  // Users Management
  { action: 'read', resource: 'users', description: 'List organization users' },
  {
    action: 'manage',
    resource: 'users',
    description: 'Invite, edit, delete users',
  },
  // Roles Management
  {
    action: 'read',
    resource: 'roles',
    description: 'View roles and permissions',
  },
  {
    action: 'manage',
    resource: 'roles',
    description: 'Create, edit, delete custom roles',
  },
  // Agent & Data
  { action: 'read', resource: 'agents', description: 'View agent status' },
  { action: 'read', resource: 'data', description: 'Query organization data' },
  { action: 'execute', resource: 'data_certification',
    description: 'Run allowlisted Data Engine V2 certification campaigns' },
  {
    action: 'manage',
    resource: 'agents',
    description: 'Manage Sage database connections',
  },
  // NLQ
  { action: 'read', resource: 'nlq', description: 'Execute NLQ queries' },
  {
    action: 'write',
    resource: 'nlq',
    description: 'Save NLQ results to dashboard',
  },
  // Audit Logs
  { action: 'read', resource: 'logs', description: 'View audit logs' },
  // Billing / Organization
  {
    action: 'manage',
    resource: 'organization',
    description: 'Manage organization settings and billing',
  },
  // Targets / Objectifs
  {
    action: 'read',
    resource: 'targets',
    description: 'View KPI targets and objectives',
  },
  {
    action: 'manage',
    resource: 'targets',
    description: 'Create, edit and delete KPI targets',
  },
  // Billing / Paiements
  {
    action: 'read',
    resource: 'billing',
    description: 'View subscription and invoices',
  },
  {
    action: 'manage',
    resource: 'billing',
    description: 'Manage subscription, checkout and cancellation',
  },
  // Global Admin
  {
    action: 'manage',
    resource: 'all',
    description: 'SuperAdmin full permissions',
  },
];

export const DEFAULT_ROLES = [
  {
    name: 'superadmin',
    description: 'InsightSage Developer / Global Administrator',
    isSystem: true,
    permissions: [{ action: 'manage', resource: 'all' }],
  },
  {
    name: 'owner',
    description: 'Organization Owner',
    isSystem: true,
    permissions: [
      { action: 'manage', resource: 'organization' },
      { action: 'manage', resource: 'users' },
      { action: 'manage', resource: 'roles' },
      { action: 'manage', resource: 'agents' },
      { action: 'read', resource: 'agents' },
      { action: 'read', resource: 'data' },
      { action: 'read', resource: 'dashboards' },
      { action: 'write', resource: 'dashboards' },
      { action: 'delete', resource: 'dashboards' },
      { action: 'read', resource: 'widgets' },
      { action: 'write', resource: 'widgets' },
      { action: 'read', resource: 'nlq' },
      { action: 'write', resource: 'nlq' },
      { action: 'read', resource: 'logs' },
      { action: 'read', resource: 'targets' },
      { action: 'manage', resource: 'targets' },
      { action: 'read', resource: 'billing' },
      { action: 'manage', resource: 'billing' },
    ],
  },
  {
    name: 'daf',
    description: 'Chief Financial Officer / Admin',
    isSystem: true,
    permissions: [
      { action: 'manage', resource: 'organization' },
      { action: 'manage', resource: 'users' },
      { action: 'manage', resource: 'roles' },
      { action: 'manage', resource: 'agents' },
      { action: 'read', resource: 'agents' },
      { action: 'read', resource: 'data' },
      { action: 'read', resource: 'dashboards' },
      { action: 'write', resource: 'dashboards' },
      { action: 'delete', resource: 'dashboards' },
      { action: 'read', resource: 'widgets' },
      { action: 'write', resource: 'widgets' },
      { action: 'read', resource: 'nlq' },
      { action: 'write', resource: 'nlq' },
      { action: 'read', resource: 'logs' },
      { action: 'read', resource: 'targets' },
      { action: 'manage', resource: 'targets' },
      { action: 'read', resource: 'billing' },
    ],
  },
  {
    name: 'controller',
    description: 'Financial Controller',
    isSystem: true,
    permissions: [
      { action: 'read', resource: 'users' },
      { action: 'read', resource: 'roles' },
      { action: 'read', resource: 'agents' },
      { action: 'read', resource: 'dashboards' },
      { action: 'write', resource: 'dashboards' },
      { action: 'read', resource: 'widgets' },
      { action: 'write', resource: 'widgets' },
      { action: 'read', resource: 'nlq' },
      { action: 'write', resource: 'nlq' },
      { action: 'read', resource: 'targets' },
      { action: 'manage', resource: 'targets' },
    ],
  },
  {
    name: 'analyst',
    description: 'Financial Analyst (Read-Only access)',
    isSystem: true,
    permissions: [
      { action: 'read', resource: 'dashboards' },
      { action: 'read', resource: 'widgets' },
      { action: 'read', resource: 'nlq' },
      { action: 'read', resource: 'targets' },
    ],
  },
];

export async function seedRbac(
  client: Pick<PrismaClient, 'permission' | 'role' | 'rolePermission'>,
) {
  // 1. Seed Permissions
  for (const perm of DEFAULT_PERMISSIONS) {
    await client.permission.upsert({
      where: {
        action_resource: { action: perm.action, resource: perm.resource },
      },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log('✅ Permissions seeded.');

  // 2. Fetch all permissions to map them to roles
  const allPerms = await client.permission.findMany();

  // Helper to find a permission ID based on action & resource
  const getPermIds = (
    rolePermSpecs: { action: string; resource: string }[],
  ) => {
    return rolePermSpecs
      .map((spec) => {
        const match = allPerms.find(
          (p) => p.action === spec.action && p.resource === spec.resource,
        );
        return match ? match.id : null;
      })
      .filter(Boolean) as string[];
  };

  // 3. Seed Roles & link their Permissions
  for (const roleDef of DEFAULT_ROLES) {
    const role = await client.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description, isSystem: roleDef.isSystem },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
    });

    // Link permissions
    const permIds = getPermIds(roleDef.permissions);

    for (const pId of permIds) {
      await client.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: pId },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: pId,
        },
      });
    }
  }
  console.log('✅ Roles & RolePermissions seeded.');
}
