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

// KPIs whose direction is LOWER_IS_BETTER
const LOWER_IS_BETTER_KEYS = new Set([
  'f05_dso',
  'f07_taux_impayes',
  'f08_bfr',
  'f14_delai_paiement_client',
  'f15_factures_echues',
  'f17_balance_agee',
  // Fournisseurs
  'fo02_dpo',
  'fo03_dettes_echues',
  // Stocks
  's03_stocks_dormants',
  's05_taux_rupture',
  // Recouvrement
  'r01_taux_impayes',
  'r02_balance_agee',
  // ML risque
  'ml03_score_risque',
  'ml04_score_churn',
]);

async function main() {
  console.log('🌱 Starting seed...');

  // ─── 0. Pas de deleteMany — le seed est idempotent (upsert partout) ─────────
  //        Les KPIs/Intents/Templates créés via l'UI admin sont préservés.

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
  // Packs disponibles (générés depuis les catégories de kpi-bis.json) :
  // pack_finance (15) | pack_tresorerie (11) | pack_clients (20) | pack_stocks (11)
  // pack_fournisseurs (10) | pack_comptabilite (10) | pack_analytique (9)
  // pack_commandes (5) | pack_audit (5) | pack_rh (4) | pack_immobilisations (4) | pack_ml_ia (10)
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
      allowedKpiPacks: ['pack_finance', 'pack_tresorerie'],
      hasNlq: false,
      hasAdvancedReports: false,
      fwPlanId: "230432",
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
      allowedKpiPacks: [
        'pack_finance',
        'pack_tresorerie',
        'pack_clients',
        'pack_fournisseurs',
        'pack_stocks',
        'pack_comptabilite',
        'pack_analytique',
        'pack_commandes',
      ],
      hasNlq: true,
      hasAdvancedReports: true,
      fwPlanId: "230433",
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
      fwPlanId: "230434",
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

  // 5. Load KPIs from kpi-bis.json (126 KPIs)
  const kpiPath = path.join(__dirname, 'kpi-bis.json');
  if (!fs.existsSync(kpiPath)) {
    throw new Error(`File not found: ${kpiPath}`);
  }
  const rawKpis = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));

  // Deduplicate by key (keep last occurrence in case of conflict)
  const kpiMap = new Map<string, any>();
  for (const kpi of rawKpis) {
    kpiMap.set(kpi.key, kpi);
  }
  const kpis = Array.from(kpiMap.values());
  if (rawKpis.length !== kpis.length) {
    console.warn(`⚠️  Deduplicated ${rawKpis.length - kpis.length} duplicate KPI keys from kpi-bis.json`);
  }

  // 6. Seed KPI Definitions & NLQ (Intents/Templates)
  console.log(`📊 Seeding ${kpis.length} KPIs and NLQ data...`);

  const categories = new Set<string>();

  for (const kpi of kpis) {
    categories.add(kpi.category);

    const direction = LOWER_IS_BETTER_KEYS.has(kpi.key)
      ? 'LOWER_IS_BETTER'
      : (kpi.direction ?? 'HIGHER_IS_BETTER');

    const kpiData = {
      name: kpi.name,
      code: kpi.code ?? null,
      domain: kpi.domain ?? null,
      description: kpi.description ?? null,
      category: kpi.category,
      subcategory: kpi.subcategory ?? null,
      usage: kpi.usage ?? null,
      unit: kpi.unit ?? null,
      frequency: kpi.frequency ?? null,
      risk: kpi.risk ?? null,
      profiles: kpi.profiles ?? [],
      sectors: kpi.sectors ?? [],
      defaultVizType: kpi.defaultVizType,
      direction,
      sqlSage100View: kpi.sqlSage100View ?? null,
      sqlSage100Tables: kpi.sqlSage100Tables ?? [],
      mlUsage: kpi.mlUsage ?? null,
    };

    // KpiDefinition
    await prisma.kpiDefinition.upsert({
      where: { key: kpi.key },
      update: kpiData,
      create: { key: kpi.key, ...kpiData },
    });

    // NLQ Intent
    await prisma.nlqIntent.upsert({
      where: { key: kpi.key },
      update: {
        label: kpi.name,
        keywords: kpi.keywords ?? [],
        category: kpi.category,
      },
      create: {
        key: kpi.key,
        label: kpi.name,
        keywords: kpi.keywords ?? [],
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

    // NLQ Template (Sage X3) — optionnel
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

  // 7. Seed Widget Templates — un template par variante (vizType + subtype)
  // Purge des anciens templates génériques (subtype='default') créés avant Option B
  await prisma.widgetTemplate.deleteMany({ where: { subtype: 'default' } });

  const WIDGET_TEMPLATES = [
    // ── card ──────────────────────────────────────────────────────────────────
    { name: 'Carte KPI',                        vizType: 'card',       subtype: 'card',           description: 'Valeur clé avec tendance et objectif',                                   defaultConfig: { period: 'month', showTrend: true, showVariance: true, showTarget: false } },
    { name: 'Indicateur de Performance Clé',    vizType: 'card',       subtype: 'kpi',            description: 'KPI avec variance, cible et statut coloré',                              defaultConfig: { period: 'month', showTrend: true, showVariance: true, showTarget: true } },

    // ── bar ───────────────────────────────────────────────────────────────────
    { name: 'Histogramme groupé',               vizType: 'bar',        subtype: 'grouped',        description: 'Colonnes côte-à-côte pour comparer plusieurs séries',                    defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'vertical' } },
    { name: 'Graphique à barres groupées',      vizType: 'bar',        subtype: 'grouped_h',      description: 'Barres horizontales côte-à-côte',                                        defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'horizontal' } },
    { name: 'Histogramme empilé',               vizType: 'bar',        subtype: 'stacked',        description: 'Colonnes empilées pour visualiser la composition',                       defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'vertical' } },
    { name: 'Graphique à barres empilées',      vizType: 'bar',        subtype: 'stacked_h',      description: 'Barres horizontales empilées',                                           defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'horizontal' } },
    { name: 'Histogramme empilé 100%',          vizType: 'bar',        subtype: 'stacked100',     description: 'Colonnes normalisées à 100% pour comparer des proportions',              defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'vertical' } },
    { name: 'Graphique à barres empilées 100%', vizType: 'bar',        subtype: 'stacked100_h',   description: 'Barres horizontales normalisées à 100%',                                 defaultConfig: { period: 'month', aggregation: 'sum', orientation: 'horizontal' } },
    { name: 'Graphique en cascade',             vizType: 'bar',        subtype: 'waterfall',      description: 'Variations cumulées (ex: pont de passage du CA au résultat)',            defaultConfig: { period: 'month', aggregation: 'sum' } },
    { name: 'Entonnoir',                        vizType: 'bar',        subtype: 'funnel',         description: 'Conversion étape par étape (ex: pipeline commercial)',                   defaultConfig: { period: 'month' } },
    { name: 'Graphique de ruban',               vizType: 'bar',        subtype: 'ribbon',         description: 'Rang relatif de catégories sur plusieurs périodes',                      defaultConfig: { period: 'month', aggregation: 'sum' } },
    { name: 'Courbe et histogramme empilé',     vizType: 'bar',        subtype: 'combo_stacked',  description: 'Histogramme empilé combiné avec courbe de tendance',                     defaultConfig: { period: 'month', aggregation: 'sum' } },
    { name: 'Courbe et histogramme empilé 100%',vizType: 'bar',        subtype: 'combo_stacked100',description: 'Histogramme 100% combiné avec courbe de tendance',                     defaultConfig: { period: 'month', aggregation: 'sum' } },

    // ── line ──────────────────────────────────────────────────────────────────
    { name: 'Graphique en courbe',              vizType: 'line',       subtype: 'line',           description: 'Évolution d\'une ou plusieurs métriques dans le temps',                 defaultConfig: { period: 'year', granularity: 'month' } },
    { name: 'Graphique en aires',               vizType: 'line',       subtype: 'area',           description: 'Courbe avec aire colorée sous la ligne',                                defaultConfig: { period: 'year', granularity: 'month' } },
    { name: 'Graphique de zone empilé',         vizType: 'line',       subtype: 'area_stacked',   description: 'Aires empilées pour visualiser la composition dans le temps',            defaultConfig: { period: 'year', granularity: 'month' } },
    { name: 'Graphique en aires empilé à 100%', vizType: 'line',       subtype: 'area_stacked100',description: 'Aires normalisées à 100% pour comparer des proportions dans le temps',  defaultConfig: { period: 'year', granularity: 'month' } },

    // ── gauge ─────────────────────────────────────────────────────────────────
    { name: 'Jauge',                            vizType: 'gauge',      subtype: 'gauge',          description: 'Indicateur circulaire pour visualiser un ratio ou objectif',             defaultConfig: { target: 100, unit: '%', showGoalLine: false } },
    { name: 'Objectif',                         vizType: 'gauge',      subtype: 'goal',           description: 'Barre de progression vers un objectif chiffré',                         defaultConfig: { target: 100, unit: '%', showGoalLine: true } },

    // ── table ─────────────────────────────────────────────────────────────────
    { name: 'Table',                            vizType: 'table',      subtype: 'flat',           description: 'Tableau de données détaillées avec pagination et tri',                   defaultConfig: { limit: 20, sortable: true, showSubtotals: false } },
    { name: 'Matrice',                          vizType: 'table',      subtype: 'matrix',         description: 'Tableau croisé avec lignes/colonnes hiérarchiques et sous-totaux',       defaultConfig: { limit: 20, sortable: true, showSubtotals: true } },

    // ── pie ───────────────────────────────────────────────────────────────────
    { name: 'Graphique en secteurs',            vizType: 'pie',        subtype: 'pie',            description: 'Répartition en parts de camembert',                                      defaultConfig: {} },
    { name: 'Graphique en anneau',              vizType: 'pie',        subtype: 'donut',          description: 'Répartition en anneau (donut) avec valeur centrale',                     defaultConfig: {} },

    // ── map ───────────────────────────────────────────────────────────────────
    { name: 'Carte',                            vizType: 'map',        subtype: 'bubble',         description: 'Carte géographique avec bulles proportionnelles aux valeurs',             defaultConfig: {} },
    { name: 'Carte choroplèthe',                vizType: 'map',        subtype: 'choropleth',     description: 'Carte colorée par intensité de valeur par région',                       defaultConfig: {} },
    { name: 'Azure Maps',                       vizType: 'map',        subtype: 'azure',          description: 'Visualisation géographique avancée via Azure Maps',                      defaultConfig: {} },

    // ── text ──────────────────────────────────────────────────────────────────
    { name: 'Texte / Commentaire',              vizType: 'text',       subtype: 'text',           description: 'Bloc texte libre ou annotation',                                         defaultConfig: {} },
    { name: 'Narratif',                         vizType: 'text',       subtype: 'narrative',      description: 'Résumé narratif automatique de données',                                 defaultConfig: {} },
    { name: 'Rapport paginé',                   vizType: 'text',       subtype: 'paginated',      description: 'Rapport structuré multi-pages',                                          defaultConfig: {} },

    // ── scatter ───────────────────────────────────────────────────────────────
    { name: 'Nuage de points',                  vizType: 'scatter',    subtype: 'scatter',        description: 'Corrélation entre deux métriques quantitatives',                         defaultConfig: { xAxis: 'value', yAxis: 'value', dotSize: 'medium' } },

    // ── treemap ───────────────────────────────────────────────────────────────
    { name: 'Treemap',                          vizType: 'treemap',    subtype: 'treemap',        description: 'Répartition hiérarchique par superficie (ex: budget par centre de coût)',defaultConfig: { groupBy: 'category', metric: 'value', showLabels: true } },

    // ── image ─────────────────────────────────────────────────────────────────
    { name: 'Image',                            vizType: 'image',      subtype: 'image',          description: 'Bloc image statique (logo, illustration, bannière)',                      defaultConfig: { fit: 'contain', align: 'center' } },

    // ── ai_insights ───────────────────────────────────────────────────────────
    { name: 'Influenceurs Clé',                 vizType: 'ai_insights',subtype: 'ai_insights',    description: 'Facteurs d\'influence sur une métrique cible (analyse IA)',               defaultConfig: { targetMetric: null, topN: 5 } },

    // ── decomp_tree ───────────────────────────────────────────────────────────
    { name: 'Arborescence de Décomposition',    vizType: 'decomp_tree',subtype: 'decomp_tree',    description: 'Décomposition hiérarchique d\'une métrique en sous-facteurs',             defaultConfig: { rootMetric: null, maxDepth: 4 } },
  ];

  for (const tpl of WIDGET_TEMPLATES) {
    await prisma.widgetTemplate.upsert({
      where: { vizType_subtype: { vizType: tpl.vizType, subtype: tpl.subtype } },
      update: {
        name: tpl.name,
        description: tpl.description,
        defaultConfig: tpl.defaultConfig,
      },
      create: tpl,
    });
  }
  console.log('✅ Widget Templates seeded.');

  // 8. Seed Dynamic KPI Packs (by category)
  console.log('📦 Seeding KPI Packs by category...');
  for (const cat of Array.from(categories)) {
    const kpiKeys = kpis.filter((k: any) => k.category === cat).map((k: any) => k.key);
    const packName = `pack_${cat}`;

    await prisma.kpiPack.upsert({
      where: { name: packName },
      update: {
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}`,
        kpiKeys: kpiKeys,
        description: `Ensemble des indicateurs pour la catégorie ${cat}`,
      },
      create: {
        name: packName,
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}`,
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
