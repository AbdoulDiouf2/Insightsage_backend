-- Version 1. Run only with explicit -v expected_database=... -v action=bind|unbind
-- and -v manifest='{"version":1,"entries":[...]}' after code and business certification.
-- No production KPI is included in this file. One transaction locks and checks the entire lot.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('cockpit.expected_database', :'expected_database', true);
SELECT set_config('cockpit.binding_action', :'action', true);
SELECT set_config('cockpit.binding_manifest', :'manifest', true);
DO $batch$
DECLARE
  manifest jsonb := current_setting('cockpit.binding_manifest')::jsonb;
  operation text := current_setting('cockpit.binding_action');
  entry jsonb;
  existing jsonb;
  expected jsonb;
  target jsonb;
  row_active boolean;
  row_name text;
  row_viz text;
BEGIN
  IF current_database() <> current_setting('cockpit.expected_database') THEN
    RAISE EXCEPTION 'Wrong database for binding batch';
  END IF;
  IF operation NOT IN ('bind', 'unbind') THEN
    RAISE EXCEPTION 'Invalid binding batch action';
  END IF;
  IF manifest->'version' IS DISTINCT FROM '1'::jsonb
     OR (manifest-'version'-'entries') <> '{}'::jsonb
     OR jsonb_typeof(manifest->'entries') IS DISTINCT FROM 'array'
     OR jsonb_array_length(manifest->'entries') = 0 THEN
    RAISE EXCEPTION 'Invalid or empty binding batch manifest';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(manifest->'entries') AS e(item)
      WHERE jsonb_typeof(item) <> 'object'
         OR item->>'key' IS NULL OR item->>'name' IS NULL OR item->>'visualization' IS NULL
         OR NOT (item ? 'before') OR NOT (item ? 'after')
         OR jsonb_typeof(item->'after') <> 'object'
         OR item->'after'->>'kind' IS DISTINCT FROM 'data_engine_v2'
         OR (item->'before' <> 'null'::jsonb AND jsonb_typeof(item->'before') <> 'object')
         OR (item->'before' <> 'null'::jsonb AND
             item->'before'->>'kind' IS DISTINCT FROM 'data_engine_v2')
         OR item->'before' = item->'after'
         OR (item-'key'-'name'-'visualization'-'before'-'after') <> '{}'::jsonb)
     OR (SELECT count(*) FROM jsonb_array_elements(manifest->'entries')) <>
        (SELECT count(DISTINCT item->>'key') FROM jsonb_array_elements(manifest->'entries') AS e(item)) THEN
    RAISE EXCEPTION 'Malformed or duplicated binding batch entry';
  END IF;
  -- Sorted locks make concurrent rollouts deterministic. A mismatch aborts the whole transaction.
  FOR entry IN SELECT item FROM jsonb_array_elements(manifest->'entries') AS e(item)
      ORDER BY item->>'key' LOOP
    SELECT "dataBinding", "isActive", name, "defaultVizType"
      INTO existing, row_active, row_name, row_viz
      FROM kpi_definitions WHERE key = entry->>'key' FOR UPDATE;
    IF NOT FOUND OR NOT row_active OR row_name <> entry->>'name'
       OR row_viz <> entry->>'visualization' THEN
      RAISE EXCEPTION 'Binding batch definition mismatch for %', entry->>'key';
    END IF;
    expected := CASE WHEN operation = 'bind' THEN entry->'before' ELSE entry->'after' END;
    target := CASE WHEN operation = 'bind' THEN entry->'after' ELSE entry->'before' END;
    IF target = 'null'::jsonb OR target IS NULL THEN target := NULL; END IF;
    IF expected = 'null'::jsonb OR expected IS NULL THEN expected := NULL; END IF;
    IF existing IS DISTINCT FROM expected AND existing IS DISTINCT FROM target THEN
      RAISE EXCEPTION 'Unexpected existing binding for %', entry->>'key';
    END IF;
    IF existing IS DISTINCT FROM target THEN
      UPDATE kpi_definitions SET "dataBinding" = target WHERE key = entry->>'key';
    END IF;
  END LOOP;
END
$batch$;
COMMIT;
