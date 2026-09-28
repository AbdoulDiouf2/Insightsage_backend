-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "dataTimezone" TEXT;

-- CreateTable
CREATE TABLE "data_jobs_v2" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "agentId" TEXT,
    "queryFingerprint" TEXT NOT NULL,
    "registryVersion" TEXT NOT NULL,
    "permissionAction" TEXT NOT NULL,
    "permissionResource" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "dispatchDeadlineAt" TIMESTAMP(3) NOT NULL,
    "executionDeadlineAt" TIMESTAMP(3),
    "resultExpiresAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "resultCiphertext" BYTEA,
    "resultIv" BYTEA,
    "encryptionKeyId" TEXT,

    CONSTRAINT "data_jobs_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_query_cache_v2" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queryFingerprint" TEXT NOT NULL,
    "registryVersion" TEXT NOT NULL,
    "resultCiphertext" BYTEA NOT NULL,
    "resultIv" BYTEA NOT NULL,
    "encryptionKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_query_cache_v2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_jobs_v2_queryId_key" ON "data_jobs_v2"("queryId");

-- CreateIndex
CREATE INDEX "data_jobs_v2_organizationId_state_idx" ON "data_jobs_v2"("organizationId", "state");

-- CreateIndex
CREATE INDEX "data_jobs_v2_organizationId_queryFingerprint_idx" ON "data_jobs_v2"("organizationId", "queryFingerprint");

-- CreateIndex
CREATE INDEX "data_query_cache_v2_expiresAt_idx" ON "data_query_cache_v2"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "data_query_cache_v2_organizationId_queryFingerprint_registr_key" ON "data_query_cache_v2"("organizationId", "queryFingerprint", "registryVersion");

-- AddForeignKey
ALTER TABLE "data_jobs_v2" ADD CONSTRAINT "data_jobs_v2_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_query_cache_v2" ADD CONSTRAINT "data_query_cache_v2_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active job per tenant and canonical query; complements Prisma model indexes.
CREATE UNIQUE INDEX "data_jobs_v2_one_active_fingerprint"
  ON "data_jobs_v2" ("organizationId", "queryFingerprint")
  WHERE "state" IN ('PENDING', 'DISPATCHED', 'RUNNING');
