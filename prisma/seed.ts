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

  // 5. Seed KPI Definitions (5 KPIs essentiels DAF)
  const KPI_DEFINITIONS = [
    {
      key: 'revenue_mom',
      name: 'CA Mois/Mois',
      description: "Chiffre d'affaires du mois en cours comparé au mois précédent",
      unit: '€',
      category: 'finance',
      defaultVizType: 'gauge',
    },
    {
      key: 'dmp',
      name: 'Délai Moyen de Paiement',
      description: 'Nombre moyen de jours entre la facturation et le paiement client',
      unit: 'jours',
      category: 'treasury',
      defaultVizType: 'card',
    },
    {
      key: 'ar_aging',
      name: 'Encours Clients',
      description: 'Montant total des créances clients en attente de règlement',
      unit: '€',
      category: 'treasury',
      defaultVizType: 'bar',
    },
    {
      key: 'gross_margin',
      name: 'Marge Brute',
      description: 'Marge brute en pourcentage du chiffre d\'affaires',
      unit: '%',
      category: 'finance',
      defaultVizType: 'gauge',
    },
    {
      key: 'ebitda',
      name: 'EBITDA',
      description: 'Bénéfice avant intérêts, impôts, dépréciation et amortissement',
      unit: '€',
      category: 'finance',
      defaultVizType: 'card',
    },
  ];

  for (const kpi of KPI_DEFINITIONS) {
    await prisma.kpiDefinition.upsert({
      where: { key: kpi.key },
      update: {
        name: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        category: kpi.category,
        defaultVizType: kpi.defaultVizType,
      },
      create: kpi,
    });
  }
  console.log('✅ KPI Definitions seeded.');

  // 6. Seed Widget Templates (5 types de visualisation)
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

  // 7. Seed KPI Packs (3 packs par profil métier)
  const KPI_PACKS = [
    {
      name: 'pack_daf',
      label: 'Pack DAF',
      profile: 'daf',
      kpiKeys: ['revenue_mom', 'dmp', 'ar_aging', 'gross_margin', 'ebitda'],
      description: 'Les 5 KPIs essentiels pour le Directeur Administratif et Financier',
    },
    {
      name: 'pack_dg',
      label: 'Pack DG',
      profile: 'dg',
      kpiKeys: ['revenue_mom', 'gross_margin', 'ebitda'],
      description: "Vue synthétique pour le Directeur Général : CA, marge et résultat",
    },
    {
      name: 'pack_controller',
      label: 'Pack Controller',
      profile: 'controller',
      kpiKeys: ['dmp', 'ar_aging', 'gross_margin'],
      description: 'KPIs de pilotage pour le Contrôleur de Gestion : trésorerie et marges',
    },
  ];

  for (const pack of KPI_PACKS) {
    await prisma.kpiPack.upsert({
      where: { name: pack.name },
      update: {
        label: pack.label,
        profile: pack.profile,
        kpiKeys: pack.kpiKeys,
        description: pack.description,
      },
      create: pack,
    });
  }
  console.log('✅ KPI Packs seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
