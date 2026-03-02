import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PERMISSIONS = [
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
  { action: 'read', resource: 'roles', description: 'View roles and permissions' },
  {
    action: 'manage',
    resource: 'roles',
    description: 'Create, edit, delete custom roles',
  },
  // Agent & Data
  { action: 'read', resource: 'agents', description: 'View agent status' },
  {
    action: 'manage',
    resource: 'agents',
    description: 'Manage Sage database connections',
  },
  // NLQ
  { action: 'read', resource: 'nlq', description: 'Execute NLQ queries' },
  { action: 'write', resource: 'nlq', description: 'Save NLQ results to dashboard' },
  // Audit Logs
  { action: 'read', resource: 'logs', description: 'View audit logs' },
  // Billing / Organization
  {
    action: 'manage',
    resource: 'organization',
    description: 'Manage organization settings and billing',
  },
  // Global Admin
  {
    action: 'manage',
    resource: 'all',
    description: 'SuperAdmin full permissions',
  },
];

const DEFAULT_ROLES = [
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
      { action: 'write', resource: 'dashboards' },
      { action: 'delete', resource: 'dashboards' },
      { action: 'write', resource: 'widgets' },
      { action: 'write', resource: 'nlq' },
      { action: 'read', resource: 'logs' },
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
      { action: 'write', resource: 'dashboards' },
      { action: 'delete', resource: 'dashboards' },
      { action: 'write', resource: 'widgets' },
      { action: 'write', resource: 'nlq' },
      { action: 'read', resource: 'logs' },
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
      { action: 'write', resource: 'dashboards' },
      { action: 'write', resource: 'widgets' },
      { action: 'write', resource: 'nlq' },
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
    ],
  },
];

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Seed Permissions
  for (const perm of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        action_resource: { action: perm.action, resource: perm.resource },
      },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log('✅ Permissions seeded.');

  // 2. Fetch all permissions to map them to roles
  const allPerms = await prisma.permission.findMany();

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
    const role = await prisma.role.upsert({
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
      await prisma.rolePermission.upsert({
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

  // 4. Seed Subscription Plans
  const SUBSCRIPTION_PLANS = [
    {
      name: 'essentiel',
      label: 'Essentiel',
      description: 'PME Sage 100. Cockpit DAF 6 KPIs. Essai parfait.',
      priceMonthly: 55, // € (36k FCFA)
      maxUsers: 3,
      maxKpis: 6,
      maxWidgets: 10,
      maxAgentSyncPerDay: 4,
      allowedKpiPacks: ['daf_basic'],
      hasNlq: false,
      hasAdvancedReports: false,
      sortOrder: 1,
    },
    {
      name: 'business',
      label: 'Business',
      description: 'DAF + équipe. NLQ illimité. Dashboards perso.',
      priceMonthly: 150, // € (98k FCFA)
      maxUsers: 10,
      maxKpis: null, // illimité
      maxWidgets: null, // illimité
      maxAgentSyncPerDay: 24,
      allowedKpiPacks: ['daf_basic', 'daf_premium', 'controller'],
      hasNlq: true,
      hasAdvancedReports: true,
      sortOrder: 2,
    },
    {
      name: 'enterprise',
      label: 'Enterprise',
      description: 'Multi-Sage + illimité. Support dédié.',
      priceMonthly: 450, // € (295k FCFA)
      maxUsers: null, // illimité
      maxKpis: null, // illimité
      maxWidgets: null, // illimité
      maxAgentSyncPerDay: null, // temps réel
      allowedKpiPacks: ['daf_basic', 'daf_premium', 'controller', 'dg', 'manager', 'analyst'],
      hasNlq: true,
      hasAdvancedReports: true,
      sortOrder: 3,
    },
  ];

  for (const plan of SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        label: plan.label,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        maxUsers: plan.maxUsers,
        maxKpis: plan.maxKpis,
        maxWidgets: plan.maxWidgets,
        maxAgentSyncPerDay: plan.maxAgentSyncPerDay,
        allowedKpiPacks: plan.allowedKpiPacks,
        hasNlq: plan.hasNlq,
        hasAdvancedReports: plan.hasAdvancedReports,
        sortOrder: plan.sortOrder,
      },
      create: plan,
    });
  }
  console.log('✅ Subscription plans seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
