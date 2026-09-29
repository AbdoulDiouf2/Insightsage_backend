import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { seedRbac } from './rbac-seed';

dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await seedRbac(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    'RBAC seed failed:',
    error?.code ?? error?.name ?? 'UNKNOWN_ERROR',
  );
  process.exitCode = 1;
});
