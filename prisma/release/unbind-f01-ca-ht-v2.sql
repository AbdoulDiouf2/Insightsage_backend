-- Functional rollback: leave the additive column and saved dashboards intact.
-- psql -v expected_database=cockpit_migration_test -f this-file.sql for an isolated test.
-- Without an explicit override, only the cockpit database is accepted.
\set ON_ERROR_STOP on
\if :{?expected_database}
\else
\set expected_database cockpit
\endif
SELECT set_config('cockpit.expected_database', :'expected_database', false);
DO $unbind$
BEGIN
  IF current_database() <> current_setting('cockpit.expected_database') THEN
    RAISE EXCEPTION 'Wrong database for binding rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM kpi_definitions WHERE key = 'f01_ca_ht'
    AND "dataBinding" IS NOT NULL AND "dataBinding" <>
    '{"kind":"data_engine_v2","metric":"revenue_ht","defaults":{"comparison":"previous_period"}}'::jsonb) THEN
    RAISE EXCEPTION 'Binding differs; refusing rollback overwrite';
  END IF;
  UPDATE kpi_definitions SET "dataBinding" = NULL
  WHERE key = 'f01_ca_ht' AND "dataBinding" IS NOT NULL;
END
$unbind$;
