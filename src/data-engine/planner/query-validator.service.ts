import { Injectable } from '@nestjs/common';
import { QueryRequest, FILTER_OPERATORS, RELATIVE_PERIODS } from '../contracts/query-request';
import { QueryFailure } from '../contracts/query-error';
import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { SecurityScopeService, AuthenticatedIdentity } from './security-scope.service';
import { isCertifiedMetric } from '../certification/certification-state';

@Injectable()
export class QueryValidatorService {
  constructor(private readonly registry: SemanticRegistryService, private readonly scope: SecurityScopeService) {}
  validate(request: QueryRequest, user: AuthenticatedIdentity) {
    return this.validateInternal(request, user, false);
  }
  /** Called only after CertificationPolicyService has authorized a server-owned campaign case. */
  validateCandidate(request: QueryRequest, user: AuthenticatedIdentity) {
    return this.validateInternal(request, user, true);
  }
  private validateInternal(request: QueryRequest, user: AuthenticatedIdentity, candidate: boolean) {
    if (!request || request.version !== '2' || !request.metric || typeof request.metric !== 'string')
      throw new QueryFailure('QUERY_INVALID', 'Requête V2 invalide');
    const forbidden = ['scope', 'organizationId', 'connector', 'sql', 'statement'];
    if (forbidden.some(field => Object.prototype.hasOwnProperty.call(request, field)))
      throw new QueryFailure('QUERY_INVALID', 'Champ public interdit');
    const securityScope = this.scope.resolve(user);
    const metric = this.registry.metric(request.metric);
    if (!isCertifiedMetric(metric) &&
        !(candidate && metric.certification.state === 'awaiting_source_validation'))
      throw new QueryFailure('NOT_CONFIGURED', 'Metrique non certifiee');
    if (!this.scope.hasPermission(user, metric.requiredPermission.action, metric.requiredPermission.resource))
      throw new QueryFailure('PERMISSION_DENIED', 'Permission manquante');
    const resource = this.registry.resource(metric.sourceMapping.connector, metric.sourceMapping.resource);
    if (!Array.isArray(request.dimensions ?? []) || !Array.isArray(request.filters ?? []))
      throw new QueryFailure('QUERY_INVALID', 'Dimensions ou filtres invalides');
    for (const key of request.dimensions ?? []) {
      if (!metric.allowedDimensions.includes(key)) throw new QueryFailure('QUERY_INVALID', 'Dimension non autorisée');
      const dimension = this.registry.dimension(key);
      if (dimension.sourceMapping.connector !== resource.connector || dimension.sourceMapping.resource !== resource.key)
        throw new QueryFailure('QUERY_INVALID', 'Dimension incompatible avec la source');
    }
    if (new Set(request.dimensions ?? []).size !== (request.dimensions ?? []).length)
      throw new QueryFailure('QUERY_INVALID', 'Dimension repetee');
    if (metric.resultPolicy) {
      const shape = request.dimensions?.length ? 'time_series' : 'scalar';
      if (!metric.resultPolicy.shapes.includes(shape))
        throw new QueryFailure('QUERY_INVALID', 'Forme de resultat non autorisee');
      if (shape === 'time_series' &&
          request.dimensions?.some(key => !this.registry.dimension(key).temporalGrain))
        throw new QueryFailure('QUERY_INVALID', 'Dimension temporelle requise');
      if (request.comparison && request.dimensions?.some(key =>
        !this.registry.dimension(key).comparisonAlignment))
        throw new QueryFailure('QUERY_INVALID', 'Comparaison groupee non alignee');
    }
    for (const filter of request.filters ?? []) {
      if (!filter || !metric.allowedFilters.includes(filter.field) || !FILTER_OPERATORS.includes(filter.operator))
        throw new QueryFailure('QUERY_INVALID', 'Filtre non autorisé');
      const validScalar = (value: unknown): value is string | number | boolean | null =>
        value === null || typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value));
      if (Array.isArray(filter.value)
        ? !filter.value.every(value => validScalar(value) && value !== null)
        : !validScalar(filter.value))
        throw new QueryFailure('QUERY_INVALID', 'Valeur de filtre invalide');
      const dimension = this.registry.dimension(filter.field);
      if (!dimension.allowedOperators.includes(filter.operator) ||
          dimension.sourceMapping.connector !== resource.connector || dimension.sourceMapping.resource !== resource.key)
        throw new QueryFailure('QUERY_INVALID', 'Filtre incompatible avec la source');
      if (filter.operator === 'between' && (!Array.isArray(filter.value) || filter.value.length !== 2) ||
          ['in', 'not_in'].includes(filter.operator) && (!Array.isArray(filter.value) || !filter.value.length) ||
          !['in', 'not_in', 'between'].includes(filter.operator) && Array.isArray(filter.value))
        throw new QueryFailure('QUERY_INVALID', 'Valeur de filtre invalide');
    }
    for (const sort of request.sort ?? []) {
      if (!request.dimensions?.includes(sort.field)) throw new QueryFailure('QUERY_INVALID', 'Tri non autorisé');
    }
    if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1000))
      throw new QueryFailure('QUERY_INVALID', 'Limite invalide');
    if (request.period && (request.period.type === 'relative'
      ? !request.period.value || !RELATIVE_PERIODS.includes(request.period.value)
      : request.period.type !== 'absolute' || !request.period.from || !request.period.to))
      throw new QueryFailure('QUERY_INVALID', 'Période invalide');
    if (metric.requiresPeriod && !request.period) throw new QueryFailure('QUERY_INVALID', 'Période requise');
    if (request.period && !metric.sourceMapping.dateDimension) throw new QueryFailure('QUERY_INVALID', 'Période non disponible');
    if (request.comparison && !metric.supportedComparisons.includes(request.comparison.type))
      throw new QueryFailure('QUERY_INVALID', 'Comparaison non disponible');
    if (request.comparison && ['budget', 'target'].includes(request.comparison.type))
      throw new QueryFailure('NOT_CONFIGURED', 'Source de comparaison non configurée');
    if (request.currency && request.currency !== metric.sourceMapping.sourceCurrency)
      throw new QueryFailure('NOT_CONFIGURED', 'Conversion de devise non configurée');
    return { metric, resource, securityScope };
  }
}
