-- Le deploy utilise prisma db push. Cet index partiel n'est pas representable
-- dans schema.prisma ; le recreer apres chaque push sans toucher aux jobs V1.
CREATE UNIQUE INDEX IF NOT EXISTS "data_jobs_v2_one_active_fingerprint"
  ON "data_jobs_v2" ("organizationId", "queryFingerprint")
  WHERE "state" IN ('PENDING', 'DISPATCHED', 'RUNNING');
