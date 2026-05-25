/**
 * Partial seed: KpiDefinition + NlqIntent + NlqTemplate + KpiPack from kpi-bis.json
 * Does NOT touch: permissions, roles, users, organizations, widgets, subscription plans.
 * Run: npx ts-node prisma/seed-kpis.ts
 */
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const LOWER_IS_BETTER_KEYS = new Set([
  'f05_dso', 'f07_taux_impayes', 'f08_bfr', 'f14_delai_paiement_client',
  'f15_factures_echues', 'f17_balance_agee',
  'fo02_dpo', 'fo03_dettes_echues',
  's03_stocks_dormants', 's05_taux_rupture',
  'r01_taux_impayes', 'r02_balance_agee',
  'ml03_score_risque', 'ml04_score_churn',
]);

async function main() {
  const kpiPath = path.join(__dirname, 'kpi-bis.json');
  const rawKpis: any[] = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));

  const kpiMap = new Map<string, any>();
  for (const kpi of rawKpis) kpiMap.set(kpi.key, kpi);
  const kpis = Array.from(kpiMap.values());

  if (rawKpis.length !== kpis.length) {
    console.warn(`⚠️  Deduplicated ${rawKpis.length - kpis.length} duplicate keys`);
  }

  console.log(`📊 Seeding ${kpis.length} KPIs...`);

  const categories = new Set<string>();
  let kpiCount = 0;

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

    // NlqIntent
    await prisma.nlqIntent.upsert({
      where: { key: kpi.key },
      update: { label: kpi.name, keywords: kpi.keywords ?? [], category: kpi.category },
      create: { key: kpi.key, label: kpi.name, keywords: kpi.keywords ?? [], category: kpi.category },
    });

    // NlqTemplate Sage 100
    if (kpi.sqlSage100) {
      await prisma.nlqTemplate.upsert({
        where: { intentKey_sageType: { intentKey: kpi.key, sageType: '100' } },
        update: { sqlQuery: kpi.sqlSage100, defaultVizType: kpi.defaultVizType },
        create: { intentKey: kpi.key, sageType: '100', sqlQuery: kpi.sqlSage100, defaultVizType: kpi.defaultVizType },
      });
    }

    // NlqTemplate Sage X3
    if (kpi.sqlSageX3) {
      await prisma.nlqTemplate.upsert({
        where: { intentKey_sageType: { intentKey: kpi.key, sageType: 'X3' } },
        update: { sqlQuery: kpi.sqlSageX3, defaultVizType: kpi.defaultVizType },
        create: { intentKey: kpi.key, sageType: 'X3', sqlQuery: kpi.sqlSageX3, defaultVizType: kpi.defaultVizType },
      });
    }

    kpiCount++;
  }

  // Orphan cleanup désactivé — préserve les KPIs/Intents/Templates créés via l'UI admin.
  // Pour nettoyer manuellement : SET PURGE_ORPHANS=1 avant d'exécuter le script.
  if (process.env.PURGE_ORPHANS === '1') {
    const validKeys = kpis.map((k) => k.key);
    const [delTemplates, delIntents, delDefs] = await Promise.all([
      prisma.nlqTemplate.deleteMany({ where: { intentKey: { notIn: validKeys } } }),
      prisma.nlqIntent.deleteMany({ where: { key: { notIn: validKeys } } }),
      prisma.kpiDefinition.deleteMany({ where: { key: { notIn: validKeys } } }),
    ]);
    if (delTemplates.count) console.log(`🗑  Orphan templates deleted: ${delTemplates.count}`);
    if (delIntents.count) console.log(`🗑  Orphan intents deleted: ${delIntents.count}`);
    if (delDefs.count) console.log(`🗑  Orphan definitions deleted: ${delDefs.count}`);
  }

  console.log(`✅ KPIs upserted: ${kpiCount}`);

  // KpiPacks — upsert par catégorie (préserve les packs créés via l'UI)
  console.log('📦 Upserting KPI Packs...');
  for (const cat of Array.from(categories)) {
    const kpiKeys = kpis.filter((k) => k.category === cat).map((k) => k.key);
    const packName = `pack_${cat}`;
    await prisma.kpiPack.upsert({
      where: { name: packName },
      update: {
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}`,
        kpiKeys,
        description: `Ensemble des indicateurs pour la catégorie ${cat}`,
      },
      create: {
        name: packName,
        label: `Pack ${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}`,
        profile: 'daf',
        kpiKeys,
        description: `Ensemble des indicateurs pour la catégorie ${cat}`,
      },
    });
  }
  console.log(`✅ KPI Packs upserted: ${categories.size}`);
  console.log('🚀 KPI seed completed.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
