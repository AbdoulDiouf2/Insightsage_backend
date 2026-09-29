import { Injectable } from '@nestjs/common';
import { QueryRequest } from '../contracts/query-request';
import { QueryFailure } from '../contracts/query-error';
import {
  AuthenticatedIdentity,
  SecurityScopeService,
} from '../planner/security-scope.service';
import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { isCertifiedMetric } from './certification-state';
import {
  certificationCampaigns,
  validateCampaigns,
} from './campaigns/campaign-registry';

const requestKeys = new Set([
  'version',
  'metric',
  'period',
  'dimensions',
  'comparison',
]);

/** Server-owned allowlist. No caller may supply a source, expression, SQL or scope. */
@Injectable()
export class CertificationPolicyService {
  constructor(
    private readonly scope: SecurityScopeService,
    private readonly registry: SemanticRegistryService,
  ) {}

  authorize(
    raw: unknown,
    user: AuthenticatedIdentity,
  ): { request: QueryRequest; campaignId: string; campaignVersion: number } {
    if (
      process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED !== 'true' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        process.env.DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID ?? '',
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID ?? '',
      )
    )
      throw new QueryFailure(
        'NOT_CONFIGURED',
        'Certification V2 non configuree',
      );
    const organizationId = this.scope.resolve(user).organizationId;
    if (
      organizationId !==
        process.env.DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID ||
      user.id !== process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID ||
      !user.userRoles?.some((ur) =>
        ur.role?.permissions?.some(
          (rp) =>
            rp.permission?.action === 'execute' &&
            rp.permission.resource === 'data_certification',
        ),
      )
    )
      throw new QueryFailure(
        'PERMISSION_DENIED',
        'Certification V2 non autorisee',
      );
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new QueryFailure(
        'QUERY_INVALID',
        'Requete de certification invalide',
      );
    const body = raw as Record<string, unknown>;
    if (
      Object.keys(body).some((key) => !requestKeys.has(key)) ||
      body.version !== '2' ||
      typeof body.metric !== 'string' ||
      !body.period ||
      typeof body.period !== 'object' ||
      Array.isArray(body.period)
    )
      throw new QueryFailure(
        'QUERY_INVALID',
        'Requete de certification invalide',
      );
    const period = body.period as Record<string, unknown>;
    if (
      Object.keys(period).sort().join(',') !== 'from,to,type' ||
      period.type !== 'absolute' ||
      typeof period.from !== 'string' ||
      typeof period.to !== 'string' ||
      (body.dimensions !== undefined &&
        (!Array.isArray(body.dimensions) ||
          !body.dimensions.every((value) => typeof value === 'string'))) ||
      body.comparison !== undefined
    )
      throw new QueryFailure('QUERY_INVALID', 'Contrat de campagne invalide');
    const metric = this.registry.metric(body.metric);
    if (
      metric.certification.state !== 'awaiting_source_validation' ||
      isCertifiedMetric(metric)
    )
      throw new QueryFailure('QUERY_INVALID', 'Metrique hors certification');
    try {
      validateCampaigns(certificationCampaigns, this.registry);
    } catch {
      throw new QueryFailure('QUERY_INVALID', 'Cas absent de la campagne');
    }
    const campaign = certificationCampaigns.find(
      (campaign) =>
        campaign.metrics.some(
          (candidate) =>
            candidate.key === body.metric &&
            JSON.stringify(candidate.dimensions) ===
              JSON.stringify(body.dimensions ?? []),
        ) &&
        campaign.registryVersion === this.registry.version &&
        campaign.periods.some(
          ([from, to]) => from === period.from && to === period.to,
        ),
    );
    if (!campaign)
      throw new QueryFailure('QUERY_INVALID', 'Cas absent de la campagne');
    return {
      campaignId: campaign.id,
      campaignVersion: campaign.version,
      request: {
        version: '2',
        metric: body.metric,
        dimensions: (body.dimensions as string[]) ?? [],
        period: { type: 'absolute', from: period.from, to: period.to },
      },
    };
  }
}
