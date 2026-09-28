import { ForbiddenException, Injectable } from '@nestjs/common';
import { SecurityScope } from '../contracts/security-scope';

export interface AuthenticatedIdentity {
  id: string;
  organizationId?: string | null;
  userRoles?: Array<{ role?: { permissions?: Array<{ permission?: { action: string; resource: string } }> } }>;
}
@Injectable()
export class SecurityScopeService {
  resolve(user: AuthenticatedIdentity | null | undefined): SecurityScope {
    // Les comptes cross-tenant doivent sélectionner un tenant par un flux distinct
    // et autorisé. Phase 1 refuse toute absence d'organisation plutôt que de
    // prendre une organisation fournie par QueryRequest.
    if (!user?.id || !user.organizationId) throw new ForbiddenException('Organisation authentifiée requise');
    return { organizationId: user.organizationId };
  }
  hasPermission(user: AuthenticatedIdentity, action: string, resource: string): boolean {
    return Boolean(user.userRoles?.some(ur => ur.role?.permissions?.some(rp =>
      (rp.permission?.action === action && rp.permission.resource === resource) ||
      (rp.permission?.action === 'manage' && rp.permission.resource === 'all'),
    )));
  }
}
