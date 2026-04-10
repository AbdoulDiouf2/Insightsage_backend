import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { AuditLogService, AuditEventType } from '../logs/audit-log.service';

// ─────────────────────────────────────────────────────────────────────────────
// Route → Event mapping
// Order matters for patterns sharing the same method : more specific first.
// Each entry: [HTTP_METHOD, path_regex, event_type]
// Regex anchors ensure no ambiguity between /dashboards/:id and /dashboards/:id/widgets.
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_ROUTES: Array<[string, RegExp, AuditEventType]> = [
  // ── Auth ─────────────────────────────────────────────────────────────────
  ['POST', /^\/auth\/login$/, 'user_login'],
  ['POST', /^\/auth\/register$/, 'user_created'],
  ['POST', /^\/auth\/logout$/, 'user_logout'],
  ['POST', /^\/auth\/refresh$/, 'token_refreshed'],
  ['POST', /^\/auth\/forgot-password$/, 'password_reset_requested'],
  ['POST', /^\/auth\/reset-password$/, 'password_reset_completed'],
  ['POST', /^\/auth\/invite$/, 'user_invited'],

  // ── Users ────────────────────────────────────────────────────────────────
  ['PATCH', /^\/users\/me$/, 'profile_updated'],
  ['PATCH', /^\/users\/[^/]+$/, 'user_updated'],
  ['DELETE', /^\/users\/[^/]+$/, 'user_deleted'],

  // ── Roles ────────────────────────────────────────────────────────────────
  ['POST', /^\/roles$/, 'role_created'],
  ['PATCH', /^\/roles\/[^/]+$/, 'role_updated'],
  ['DELETE', /^\/roles\/[^/]+$/, 'role_deleted'],

  // ── Widgets (MUST be before /:id dashboard patterns) ─────────────────────
  ['POST', /^\/dashboards\/[^/]+\/widgets$/, 'widget_added'],
  ['PATCH', /^\/dashboards\/[^/]+\/widgets\/[^/]+$/, 'widget_updated'],
  ['DELETE', /^\/dashboards\/[^/]+\/widgets\/[^/]+$/, 'widget_removed'],

  // ── Dashboards ───────────────────────────────────────────────────────────
  ['POST', /^\/dashboards$/, 'dashboard_created'],
  ['PATCH', /^\/dashboards\/[^/]+$/, 'dashboard_updated'],
  ['DELETE', /^\/dashboards\/[^/]+$/, 'dashboard_deleted'],

  // ── Agents (static paths before /:id generics) ───────────────────────────
  ['POST', /^\/agents\/register$/, 'agent_registered'],
  ['POST', /^\/agents\/generate-token$/, 'agent_token_generated'],
  ['POST', /^\/agents\/query$/, 'agent_query_executed'],
  ['POST', /^\/agents\/[^/]+\/regenerate-token$/, 'agent_token_regenerated'],
  ['POST', /^\/agents\/[^/]+\/revoke$/, 'agent_token_revoked'],
  ['POST', /^\/agents\/[^/]+\/test-connection$/, 'agent_connection_tested'],

  // ── Agent v1 (installeur Electron + sync) ────────────────────────────────
  ['POST', /^\/v1\/agent\/validate$/, 'agent_registered'],
  ['POST', /^\/v1\/agent\/ingest$/, 'agent_query_executed'],
  ['POST', /^\/v1\/agent\/[^/]+\/command$/, 'agent_query_executed'],

  // ── Onboarding ───────────────────────────────────────────────────────────
  ['POST', /^\/onboarding\/step1$/, 'onboarding_step_completed'],
  ['POST', /^\/onboarding\/step2$/, 'onboarding_step_completed'],
  ['POST', /^\/onboarding\/step3$/, 'datasource_configured'],
  ['POST', /^\/onboarding\/agent-link$/, 'agent_linked'],
  ['POST', /^\/onboarding\/step4$/, 'onboarding_step_completed'],
  ['POST', /^\/onboarding\/step5$/, 'users_invited_bulk'],

  // ── Admin – Organizations ─────────────────────────────────────────────────
  ['POST', /^\/admin\/clients$/, 'organization_created'],
  ['PATCH', /^\/admin\/organizations\/[^/]+$/, 'organization_updated'],
  ['DELETE', /^\/admin\/organizations\/[^/]+$/, 'organization_deleted'],

  // ── Admin – Users ─────────────────────────────────────────────────────────
  ['POST', /^\/admin\/users$/, 'user_created'],
  ['PATCH', /^\/admin\/users\/[^/]+$/, 'user_updated'],
  ['DELETE', /^\/admin\/users\/[^/]+$/, 'user_deleted'],

  // ── Admin – Subscription Plans ────────────────────────────────────────────
  ['POST', /^\/admin\/subscription-plans$/, 'subscription_plan_created'],
  ['PATCH', /^\/admin\/subscription-plans\/[^/]+$/, 'subscription_plan_updated'],
  ['DELETE', /^\/admin\/subscription-plans\/[^/]+$/, 'subscription_plan_deactivated'],

  // ── Admin – KPI Definitions ───────────────────────────────────────────────
  ['POST', /^\/admin\/kpi-definitions$/, 'kpi_definition_created'],
  ['PATCH', /^\/admin\/kpi-definitions\/[^/]+$/, 'kpi_definition_updated'],
  ['DELETE', /^\/admin\/kpi-definitions\/[^/]+$/, 'kpi_definition_toggled'],

  // ── Admin – Widget Templates ──────────────────────────────────────────────
  ['POST', /^\/admin\/widget-templates$/, 'widget_template_created'],
  ['PATCH', /^\/admin\/widget-templates\/[^/]+$/, 'widget_template_updated'],
  ['DELETE', /^\/admin\/widget-templates\/[^/]+$/, 'widget_template_toggled'],

  // ── Admin – KPI Packs ─────────────────────────────────────────────────────
  ['POST', /^\/admin\/kpi-packs$/, 'kpi_pack_created'],
  ['PATCH', /^\/admin\/kpi-packs\/[^/]+$/, 'kpi_pack_updated'],
  ['DELETE', /^\/admin\/kpi-packs\/[^/]+$/, 'kpi_pack_toggled'],

  // ── Consultations de données sensibles (GETs) ────────────────────────────
  ['GET', /^\/logs\/audit/, 'audit_logs_viewed'],
  ['GET', /^\/admin\/audit-logs/, 'audit_logs_viewed'],
  ['GET', /^\/admin\/users/, 'admin_users_listed'],
  ['GET', /^\/admin\/organizations/, 'admin_organizations_listed'],
];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & {
      user?: { id: string; organizationId: string };
      isSuperAdminAccess?: boolean;
    }>();

    const method = req.method;
    const path = req.url.split('?')[0]; // strip query string

    const eventType = this.resolveEvent(method, path);
    // If this route is not auditable, pass through immediately
    if (!eventType) return next.handle();

    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    const ipAddress = req.ip ?? (req.socket?.remoteAddress);
    const userAgent = req.headers['user-agent'];
    const isSuperAdminAccess = req.isSuperAdminAccess === true;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap((response: any) => {
        void this.auditLog.log({
          userId,
          organizationId,
          event: eventType,
          ipAddress,
          userAgent,
          payload: {
            source: 'http',
            method,
            path,
            duration_ms: Date.now() - startedAt,
            status: 'success',
            entityId: response?.id ?? undefined,
            body: this.sanitizeBody(req.body),
            ...(isSuperAdminAccess && { superadmin_cross_tenant: true }),
          },
        });
      }),
      catchError((error: any) => {
        void this.auditLog.log({
          userId,
          organizationId,
          event: eventType,
          ipAddress,
          userAgent,
          payload: {
            source: 'http',
            method,
            path,
            duration_ms: Date.now() - startedAt,
            status: 'error',
            statusCode: error?.status ?? error?.statusCode ?? 500,
            errorMessage: error?.message,
            body: this.sanitizeBody(req.body),
            ...(isSuperAdminAccess && { superadmin_cross_tenant: true }),
          },
        });
        return throwError(() => error);
      }),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveEvent(method: string, path: string): AuditEventType | null {
    for (const [m, pattern, event] of AUDIT_ROUTES) {
      if (m === method && pattern.test(path)) return event;
    }
    return null;
  }

  /**
   * Extrait uniquement les champs primitifs du body pour éviter
   * le stockage de payloads massifs (tableaux, blobs, etc.).
   * La sanitization PII (email, password) est déjà gérée par AuditLogService.
   */
  private sanitizeBody(body: any): Record<string, any> {
    if (!body || typeof body !== 'object') return {};
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === null || typeof value !== 'object') {
        safe[key] = value;
      } else if (Array.isArray(value)) {
        safe[key] = `[Array(${value.length})]`;
      } else {
        safe[key] = '[object]';
      }
    }
    return safe;
  }
}
