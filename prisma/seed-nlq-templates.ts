/**
 * Partial seed: update NlqTemplate sqlQuery from kpi-bis.json WITHOUT touching widgets.
 * Use when templates in DB have stale SQL (raw Sage column names instead of view columns).
 * Run: npx ts-node prisma/seed-nlq-templates.ts
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

async function main() {
    const kpiPath = path.join(__dirname, 'kpi-bis.json');
    const rawKpis = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));

    const kpiMap = new Map<string, any>();
    for (const kpi of rawKpis) kpiMap.set(kpi.key, kpi);
    const kpis = Array.from(kpiMap.values());

    console.log(`Updating NLQ templates for ${kpis.length} KPIs...`);

    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const kpi of kpis) {
        if (kpi.sqlSage100) {
            const result = await prisma.nlqTemplate.upsert({
                where: { intentKey_sageType: { intentKey: kpi.key, sageType: '100' } },
                update: { sqlQuery: kpi.sqlSage100, defaultVizType: kpi.defaultVizType },
                create: {
                    intentKey: kpi.key,
                    sageType: '100',
                    sqlQuery: kpi.sqlSage100,
                    defaultVizType: kpi.defaultVizType,
                },
            });
            if (result) updated++;
        } else {
            skipped++;
        }

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

    // Delete orphan templates (key no longer in kpi-bis.json)
    const validKeys = kpis.map((k: any) => k.key);
    const deleted = await prisma.nlqTemplate.deleteMany({
        where: { intentKey: { notIn: validKeys } },
    });

    console.log(`Done. Updated/created: ${updated} Sage100 templates. Skipped (no SQL): ${skipped}. Orphans deleted: ${deleted.count}.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
