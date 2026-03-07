import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEventType =
  // ── Auth ───────────────────────────────────────────────────────────────────
  | 'user_login'
  | 'user_logout'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_invited'
  | 'token_refreshed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  // ── Profile ────────────────────────────────────────────────────────────────
  | 'profile_updated'
  // ── Roles ──────────────────────────────────────────────────────────────────
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  // ── Dashboards & Widgets ───────────────────────────────────────────────────
  | 'dashboard_created'
  | 'dashboard_updated'
  | 'dashboard_deleted'
  | 'widget_added'
  | 'widget_updated'
  | 'widget_removed'
  // ── NLQ ────────────────────────────────────────────────────────────────────
  | 'nlq_executed'
  | 'nlq_saved_to_dashboard'
  // ── Agents ─────────────────────────────────────────────────────────────────
  | 'agent_registered'
  | 'agent_deleted'
  | 'agent_token_generated'
  | 'agent_token_regenerated'
  | 'agent_token_revoked'
  | 'agent_token_expired'
  | 'agent_heartbeat'
  | 'agent_error'
  | 'agent_connection_tested'
  | 'agent_query_executed'
  | 'agent_job_timeout'
  // ── Organizations ──────────────────────────────────────────────────────────
  | 'organization_created'
  | 'organization_updated'
  | 'organization_deleted'
  // ── Onboarding ─────────────────────────────────────────────────────────────
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'datasource_configured'
  | 'agent_linked'
  // ── Subscription Plans ─────────────────────────────────────────────────────
  | 'subscription_plan_selected'
  | 'subscription_plan_created'
  | 'subscription_plan_updated'
  | 'subscription_plan_deactivated'
  // ── KPI Definitions ────────────────────────────────────────────────────────
  | 'kpi_definition_created'
  | 'kpi_definition_updated'
  | 'kpi_definition_toggled'
  // ── Widget Templates ───────────────────────────────────────────────────────
  | 'widget_template_created'
  | 'widget_template_updated'
  | 'widget_template_toggled'
  // ── KPI Packs ──────────────────────────────────────────────────────────────
  | 'kpi_pack_created'
  | 'kpi_pack_updated'
  | 'kpi_pack_toggled'
  // ── Invitations ────────────────────────────────────────────────────────────
  | 'users_invited_bulk'
  // ── Targets / Objectifs KPI ────────────────────────────────────────────────
  | 'target_created'
  | 'target_updated'
  | 'target_deleted'
  // ── Audit / Consultation données sensibles ─────────────────────────────────
  | 'audit_logs_viewed'
  | 'admin_users_listed'
  | 'admin_organizations_listed';

export interface AuditLogPayload {
  organizationId?: string | null;
  userId?: string;
  event: AuditEventType;
  payload?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AuditLogService - Centralized audit logging with PII masking (Section 2.3)
 *
 * Toutes les données sensibles (emails, mots de passe) sont masquées
 * avant d'être persistées dans les audit logs.
 */
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) { }

  /**
   * Masque un email : jean.dupont@acme.com → j***@acme.com
   */
  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    const masked = local.length > 1 ? `${local[0]}***` : '*';
    return `${masked}@${domain}`;
  }

  /**
   * Sanitise le payload avant stockage :
   * - Masque toute valeur dont la clé contient "email"
   * - Masque toute valeur dont la clé contient "password"
   */
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== 'object') return payload;

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('email') && typeof value === 'string') {
        sanitized[key] = this.maskEmail(value);
      } else if (lowerKey.includes('password') && typeof value === 'string') {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, any>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async log(data: AuditLogPayload): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: data.organizationId || null,
          userId: data.userId,
          event: data.event,
          payload: data.payload ? this.sanitizePayload(data.payload) : {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      // Ne pas laisser un échec de log casser le flux principal
      console.error('Failed to write audit log:', error);
    }
  }

  async logBatch(events: AuditLogPayload[]): Promise<void> {
    try {
      await this.prisma.auditLog.createMany({
        data: events.map((e) => ({
          organizationId: e.organizationId || null,
          userId: e.userId,
          event: e.event,
          payload: e.payload ? this.sanitizePayload(e.payload) : {},
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
        })),
      });
    } catch (error) {
      console.error('Failed to write batch audit logs:', error);
    }
  }
}
