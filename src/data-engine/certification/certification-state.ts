import { MetricDefinition } from '../contracts/semantic-definition';
import { createHash } from 'node:crypto';

export function metricDefinitionHash(metric: MetricDefinition): string {
  const { certification: _certification, ...definition } = metric;
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

/** Neither static tests nor raw Sage observations can certify a metric automatically. */
export function isCertifiedMetric(metric: MetricDefinition): boolean {
  const certification = metric.certification;
  const evidence = certification?.evidence;
  return certification?.version === 1 && certification.state === 'certified' &&
    !!evidence?.referenceId && !!evidence.reviewedAt && !!evidence.source &&
    evidence.definitionSha256 === metricDefinitionHash(metric) &&
    !!evidence.periodFrom && !!evidence.periodTo && !!evidence.value &&
    Number.isSafeInteger(evidence.sourceRows) && evidence.sourceRows >= 0;
}
