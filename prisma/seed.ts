import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

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
  // Targets / Objectifs
  { action: 'read', resource: 'targets', description: 'View KPI targets and objectives' },
  {
    action: 'manage',
    resource: 'targets',
    description: 'Create, edit and delete KPI targets',
  },
  // Billing / Paiements
  { action: 'read', resource: 'billing', description: 'View subscription and invoices' },
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
      { action: 'write', resource: 'dashboards' },
      { action: 'delete', resource: 'dashboards' },
      { action: 'write', resource: 'widgets' },
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
      { action: 'write', resource: 'dashboards' },
      { action: 'write', resource: 'widgets' },
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
      priceMonthly: 36000, // FCFA (approx 55 €)
      maxUsers: 3,
      maxKpis: 6,
      maxWidgets: 10,
      maxAgentSyncPerDay: null,
      allowedKpiPacks: ['pack_finance', 'pack_rentabilite'],
      hasNlq: false,
      hasAdvancedReports: false,
      fwPlanId: null, // Configurer après création du Payment Plan dans Flutterwave Dashboard
      sortOrder: 1,
    },
    {
      name: 'business',
      label: 'Business',
      description: 'DAF + équipe. NLQ illimité. Dashboards perso.',
      priceMonthly: 100000, // FCFA (approx 150 €)
      maxUsers: 10,
      maxKpis: null,
      maxWidgets: null,
      maxAgentSyncPerDay: null,
      allowedKpiPacks: ['pack_finance', 'pack_rentabilite', 'pack_tresorerie', 'pack_client', 'pack_achats'],
      hasNlq: true,
      hasAdvancedReports: true,
      fwPlanId: null, // Configurer après création du Payment Plan dans Flutterwave Dashboard
      sortOrder: 2,
    },
    {
      name: 'enterprise',
      label: 'Enterprise',
      description: 'Multi-Sage + illimité. Support dédié.',
      priceMonthly: 300000, // FCFA (approx 450 €)
      maxUsers: null,
      maxKpis: null,
      maxWidgets: null,
      maxAgentSyncPerDay: null,
      allowedKpiPacks: ['all'],
      hasNlq: true,
      hasAdvancedReports: true,
      fwPlanId: null, // Configurer après création du Payment Plan dans Flutterwave Dashboard
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
        fwPlanId: plan.fwPlanId,
        sortOrder: plan.sortOrder,
      },
      create: plan,
    });
  }
  console.log('✅ Subscription plans seeded.');

  // 5. Load KPIs from JSON
  const kpiPath = path.join(__dirname, 'kpi.json');
  if (!fs.existsSync(kpiPath)) {
    throw new Error(`File not found: ${kpiPath}`);
  }
  const kpis = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));

  // 6. Seed KPI Definitions & NLQ (Intents/Templates)
  console.log(`📊 Seeding ${kpis.length} KPIs and NLQ data...`);

  const categories = new Set<string>();

  for (const kpi of kpis) {
    categories.add(kpi.category);

    // KpiDefinition
    await prisma.kpiDefinition.upsert({
      where: { key: kpi.key },
      update: {
        name: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        category: kpi.category,
        defaultVizType: kpi.defaultVizType,
        direction: kpi.direction ?? 'HIGHER_IS_BETTER',
      },
      create: {
        key: kpi.key,
        name: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        category: kpi.category,
        defaultVizType: kpi.defaultVizType,
        direction: kpi.direction ?? 'HIGHER_IS_BETTER',
      },
    });

    // NLQ Intent
    await prisma.nlqIntent.upsert({
      where: { key: kpi.key },
      update: {
        label: kpi.name,
        keywords: kpi.keywords,
        category: kpi.category,
      },
      create: {
        key: kpi.key,
        label: kpi.name,
        keywords: kpi.keywords,
        category: kpi.category,
      },
    });

    // NLQ Template (Sage 100)
    if (kpi.sqlSage100) {
      await prisma.nlqTemplate.upsert({
        where: { intentKey_sageType: { intentKey: kpi.key, sageType: '100' } },
        update: { sqlQuery: kpi.sqlSage100, defaultVizType: kpi.defaultVizType },
        create: {
          intentKey: kpi.key,
          sageType: '100',
          sqlQuery: kpi.sqlSage100,
          defaultVizType: kpi.defaultVizType,
        },
      });
    }

    // NLQ Template (Sage X3)
    if (kpi.sqlSageX3) {
      await prisma.nlqTemplate.upsert({
        where: { intentKey_sageType: { intentKey: kpi.key, sageType: 'X3' } },
        update: { sqlQuery: kpi.sqlSageX3, defaultVizType: kpi.defaultVizType },
        create: {
          intentKey: kpi.key,
          sageType: 'X3',
          sqlQuery: kpi.sqlSageX3,
          defaultVizType: kpi.defaultVizType,
        },
      });
    }
  }
  console.log('✅ KPI Definitions & NLQ seeded.');

  // 7. Seed Widget Templates (Widget Store base)
  const WIDGET_TEMPLATES = [
    {
      name: 'Carte KPI',
      vizType: 'card',
      description: 'Affichage simple d\'une valeur clé avec tendance',
      defaultConfig: { period: 'month', showTrend: true },
    },
    {
      name: 'Graphique Barres',
      vizType: 'bar',
      description: 'Graphique en barres pour comparer des périodes ou catégories',
      defaultConfig: { period: 'month', aggregation: 'sum' },
    },
    {
      name: 'Courbe Temporelle',
      vizType: 'line',
      description: 'Évolution d\'une métrique sur une période glissante',
      defaultConfig: { period: 'year', granularity: 'month' },
    },
    {
      name: 'Jauge',
      vizType: 'gauge',
      description: 'Indicateur circulaire pour visualiser un ratio ou objectif',
      defaultConfig: { target: 100, unit: '%' },
    },
    {
      name: 'Tableau',
      vizType: 'table',
      description: 'Tableau de données détaillées avec pagination',
      defaultConfig: { limit: 20, sortable: true },
    },
  ];

  for (const tpl of WIDGET_TEMPLATES) {
    await prisma.widgetTemplate.upsert({
      where: { vizType: tpl.vizType },
      update: {
        name: tpl.name,
        description: tpl.description,
        defaultConfig: tpl.defaultConfig,
      },
      create: tpl,
    });
  }
  console.log('✅ Widget Templates seeded.');

  // 8. Seed Dynamic KPI Packs
  console.log('📦 Seeding KPI Packs by category...');
  for (const cat of Array.from(categories)) {
    const kpiKeys = kpis.filter((k: any) => k.category === cat).map((k: any) => k.key);
    const packName = `pack_${cat}`;

    await prisma.kpiPack.upsert({
      where: { name: packName },
      update: {
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}`,
        profile: 'daf', // Default to DAF for all packs for now
        kpiKeys: kpiKeys,
        description: `Ensemble des indicateurs pour la catégorie ${cat}`,
      },
      create: {
        name: packName,
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}`,
        profile: 'daf',
        kpiKeys: kpiKeys,
        description: `Ensemble des indicateurs pour la catégorie ${cat}`,
      },
    });
  }
  console.log('✅ KPI Packs seeded.');

  // 9. Default Organization & Admin
  const businessPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'business' } });
  let demoOrg = await prisma.organization.findFirst({ where: { name: 'Nafaka Tech' } });

  if (!demoOrg) {
    demoOrg = await prisma.organization.create({
      data: {
        name: 'Nafaka Tech',
        size: 'pme',
        planId: businessPlan?.id,
      },
    });
  }

  const passwordHash = await bcrypt.hash('InsightSage2026!', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@insightsage.com' },
    update: { passwordHash, organizationId: demoOrg.id },
    create: {
      email: 'admin@insightsage.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash,
      organizationId: demoOrg.id,
      emailVerified: true,
    },
  });

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'superadmin' } });
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: superAdminRole.id },
    });
  }

  await prisma.organization.update({
    where: { id: demoOrg.id },
    data: { ownerId: adminUser.id },
  });

  console.log('🚀 Seed completed successfully!');
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
