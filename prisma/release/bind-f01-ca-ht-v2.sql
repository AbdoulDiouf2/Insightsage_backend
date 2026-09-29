-- Apply manually only after backend and frontend are deployed and verified.
-- This file changes one catalog binding, never Sage data or saved widgets.
-- psql -v expected_database=cockpit_migration_test -f this-file.sql for an isolated test.
-- Without an explicit override, only the cockpit database is accepted.
\set ON_ERROR_STOP on
\if :{?expected_database}
\else
\set expected_database cockpit
\endif
SELECT set_config('cockpit.expected_database', :'expected_database', false);
DO $binding$
BEGIN
  IF current_database() <> current_setting('cockpit.expected_database') THEN
    RAISE EXCEPTION 'Wrong database for binding rollout';
  END IF;
  IF (SELECT count(*) FROM kpi_definitions WHERE key = 'f01_ca_ht' AND "isActive" = true
      AND "defaultVizType" = 'card') <> 1 THEN
    RAISE EXCEPTION 'Expected active f01_ca_ht card definition not found';
  END IF;
  IF EXISTS (SELECT 1 FROM kpi_definitions WHERE key = 'f01_ca_ht'
      AND "dataBinding" IS NOT NULL
      AND "dataBinding" <> '{"kind":"data_engine_v2","metric":"revenue_ht","defaults":{"comparison":"previous_period"}}'::jsonb) THEN
    RAISE EXCEPTION 'Existing binding differs; refusing overwrite';
  END IF;
  UPDATE kpi_definitions
  SET "dataBinding" = '{"kind":"data_engine_v2","metric":"revenue_ht","defaults":{"comparison":"previous_period"}}'::jsonb
  WHERE key = 'f01_ca_ht' AND "dataBinding" IS NULL;
END
$binding$;
