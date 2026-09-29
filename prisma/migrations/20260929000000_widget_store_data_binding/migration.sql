-- Additive metadata only. The deployed workflow currently applies the Prisma schema with db push.
ALTER TABLE "kpi_definitions" ADD COLUMN IF NOT EXISTS "dataBinding" JSONB;
