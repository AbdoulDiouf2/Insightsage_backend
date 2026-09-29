import { QueryFailure } from '../contracts/query-error';
import { QueryPlan } from '../contracts/query-plan';

/** Validate Agent rows against trusted registry metadata, never against the metric key. */
export function validateMetricRows(plan: QueryPlan, rows: Record<string, unknown>[]) {
  const policy = plan.metric.resultPolicy;
  if (!policy) return;
  const scale = policy.scale;
  const decimal = scale === undefined ? /^-?\d+(?:\.\d+)?$/ :
    new RegExp(scale === 0 ? '^-?\\d+$' : `^-?\\d+\\.\\d{${scale}}$`);
  if (!plan.dimensions.length && rows.length > 1)
    throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Cardinalite scalaire invalide');
  const allowedKeys = new Set(['value', '__source_row_count', ...plan.dimensions.map(d => d.key)]);
  const dimensionTuples = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !allowedKeys.has(key)))
      throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Colonnes source inattendues');
    const count = Number(row.__source_row_count);
    if (policy.sourceRowCount === 'required' &&
        (!Number.isSafeInteger(count) || count < 0))
      throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Nombre de lignes source invalide');
    if (row.__source_row_count !== undefined && (!Number.isSafeInteger(count) || count < 0))
      throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Nombre de lignes source invalide');
    if (count === 0 && policy.empty === 'preserve' && row.value !== null)
      throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Resultat vide invalide');
    if (count > 0 || policy.empty === 'zero_if_empty_set' ||
        policy.sourceRowCount === 'optional' && count !== 0) {
      if (policy.valueEncoding === 'decimal_string'
        ? typeof row.value !== 'string' || !decimal.test(row.value)
        : typeof row.value !== 'number' || !Number.isFinite(row.value))
        throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Valeur metrique invalide');
      if (policy.precision && String(row.value).replace(/[^0-9]/g, '').length > policy.precision)
        throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Precision metrique invalide');
      if (count === 0 && Number(row.value) !== 0)
        throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Valeur vide non nulle');
    }
    for (const dimension of plan.dimensions) {
      const pattern = policy.dimensionPatterns?.[dimension.key];
      const value = row[dimension.key];
      if (value === undefined || value === null ||
          dimension.dataType === 'string' && typeof value !== 'string' ||
          dimension.dataType === 'number' && (typeof value !== 'number' || !Number.isFinite(value)) ||
          dimension.dataType === 'boolean' && typeof value !== 'boolean' ||
          dimension.dataType === 'date' && (typeof value !== 'string' || Number.isNaN(Date.parse(value))) ||
          pattern && (typeof row[dimension.key] !== 'string' ||
            !new RegExp(pattern).test(row[dimension.key] as string)))
        throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Dimension metrique invalide');
    }
    if (plan.dimensions.length) {
      const tuple = JSON.stringify(plan.dimensions.map(d => row[d.key]));
      if (dimensionTuples.has(tuple))
        throw new QueryFailure('SOURCE_SCHEMA_MISMATCH', 'Dimension repetee dans le resultat');
      dimensionTuples.add(tuple);
    }
  }
}

export function comparisonDimensionValue(key: string, current: unknown, plan: QueryPlan): unknown {
  const dimension = plan.dimensions.find(d => d.key === key);
  if (dimension?.comparisonAlignment !== 'calendar_month_offset' ||
      !plan.period || !plan.comparison?.fromInclusive || typeof current !== 'string' ||
      !/^\d{4}-\d{2}$/.test(current)) return current;
  const monthInZone = (instant: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: plan.period!.timezone,
      year: 'numeric', month: '2-digit' }).formatToParts(new Date(instant));
    return Number(parts.find(p => p.type === 'year')!.value) * 12 +
      Number(parts.find(p => p.type === 'month')!.value) - 1;
  };
  const offset = monthInZone(plan.period.fromInclusive) - monthInZone(plan.comparison.fromInclusive);
  const index = Number(current.slice(0, 4)) * 12 + Number(current.slice(5, 7)) - 1 - offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
