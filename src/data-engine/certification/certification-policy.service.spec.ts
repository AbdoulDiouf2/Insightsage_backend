import { CertificationPolicyService } from './certification-policy.service';
import { financeGeneralCampaign } from './campaigns/finance-general.campaign';
import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { SecurityScopeService } from '../planner/security-scope.service';

const organizationId = 'b51d935f-07c5-4a8e-b1ca-9fd5bdccda44';
const userId = 'db06b13b-cf20-4897-99d6-8018d2f02fad';
const user = { id: userId, organizationId, userRoles: [{ role: { permissions: [
  { permission: { action: 'read', resource: 'data' } },
  { permission: { action: 'execute', resource: 'data_certification' } },
] } }] };

describe('versioned V2 certification campaign policy', () => {
  const registry = new SemanticRegistryService();
  const policy = new CertificationPolicyService(new SecurityScopeService(), registry);
  beforeAll(() => {
    process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED = 'true';
    process.env.DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID = organizationId;
    process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID = userId;
  });
  afterAll(() => {
    delete process.env.DATA_ENGINE_V2_CERTIFICATION_ENABLED;
    delete process.env.DATA_ENGINE_V2_CERTIFICATION_ORGANIZATION_ID;
    delete process.env.DATA_ENGINE_V2_CERTIFICATION_USER_ID;
  });

  it('has exactly nine server-owned candidate cases pinned to the current registry', () => {
    expect(registry.version).toBe(financeGeneralCampaign.registryVersion);
    expect(financeGeneralCampaign.metrics).toHaveLength(3);
    expect(financeGeneralCampaign.periods).toHaveLength(3);
    let accepted = 0;
    for (const metric of financeGeneralCampaign.metrics)
      for (const [from, to] of financeGeneralCampaign.periods) {
        const grant = policy.authorize({ version: '2', metric: metric.key,
          dimensions: metric.dimensions, period: { type: 'absolute', from, to } }, user);
        expect(grant.campaignId).toBe(financeGeneralCampaign.id);
        accepted++;
      }
    expect(accepted).toBe(9);
  });

  it('rejects a changed registry, even if the metric name stays the same', () => {
    const changed = new SemanticRegistryService();
    changed.registerMetric({ ...changed.metric('revenue_ttc'), defaultCacheTtlSeconds: 1 });
    const changedPolicy = new CertificationPolicyService(new SecurityScopeService(), changed);
    expect(() => changedPolicy.authorize({ version: '2', metric: 'revenue_ttc',
      dimensions: [], period: { type: 'absolute',
        from: '2022-01-01T00:00:00.000Z', to: '2022-02-01T00:00:00.000Z' } }, user))
      .toThrow('Cas absent de la campagne');
  });
});
