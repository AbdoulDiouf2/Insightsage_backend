import { KpiDefinition } from '@prisma/client';
import { DataBindingService } from '../data-binding.service';

/** Explicit public projection: connector metadata never leaves the backend. */
export function publicKpiDefinition(kpi: KpiDefinition, bindings: DataBindingService) {
  return {
    id: kpi.id, key: kpi.key, code: kpi.code, name: kpi.name,
    description: kpi.description, category: kpi.category,
    subcategory: kpi.subcategory, domain: kpi.domain, unit: kpi.unit,
    frequency: kpi.frequency, profiles: kpi.profiles,
    defaultVizType: kpi.defaultVizType, direction: kpi.direction,
    isActive: kpi.isActive,
    dataBinding: bindings.publicValue(kpi.dataBinding, kpi.defaultVizType),
  };
}

export function publicWidgetTemplate(template: {
  id: string; name: string; vizType: string; subtype: string; description: string | null;
  defaultConfig: unknown; isActive: boolean;
}) {
  const raw = template.defaultConfig && typeof template.defaultConfig === 'object' &&
    !Array.isArray(template.defaultConfig) ? template.defaultConfig as Record<string, unknown> : {};
  const allowed = ['showTrend', 'showVariance', 'showTarget', 'showLabels',
    'showGoalLine', 'sortable', 'showSubtotals'];
  const defaultConfig: Record<string, string | number | boolean | null> = {};
  for (const key of allowed) if (typeof raw[key] === 'boolean') defaultConfig[key] = raw[key] as boolean;
  const enums: Record<string, string[]> = {
    period: ['month', 'quarter', 'year'], aggregation: ['sum', 'avg', 'min', 'max', 'count'],
    orientation: ['vertical', 'horizontal'], granularity: ['month', 'quarter', 'year'],
    unit: ['%', 'FCFA', 'XOF', 'EUR'], xAxis: ['value'], yAxis: ['value'],
    dotSize: ['small', 'medium', 'large'], groupBy: ['category'], metric: ['value'],
    fit: ['contain', 'cover'], align: ['center', 'left', 'right'],
  };
  for (const [key, values] of Object.entries(enums))
    if (typeof raw[key] === 'string' && values.includes(raw[key] as string))
      defaultConfig[key] = raw[key] as string;
  for (const key of ['target', 'limit', 'topN', 'maxDepth'])
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) &&
      (raw[key] as number) >= 0 && (raw[key] as number) <= 10000)
      defaultConfig[key] = raw[key] as number;
  for (const key of ['targetMetric', 'rootMetric']) if (raw[key] === null) defaultConfig[key] = null;
  return { id: template.id, name: template.name, vizType: template.vizType,
    subtype: template.subtype, description: template.description, defaultConfig,
    isActive: template.isActive };
}
