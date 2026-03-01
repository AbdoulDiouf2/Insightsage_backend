import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEventType =
  | 'user_login'
  | 'user_logout'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_invited'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'dashboard_created'
  | 'dashboard_updated'
  | 'dashboard_deleted'
  | 'widget_added'
  | 'widget_updated'
  | 'widget_removed'
  | 'nlq_executed'
  | 'nlq_saved_to_dashboard'
  | 'agent_registered'
  | 'agent_heartbeat'
  | 'agent_error'
  | 'organization_updated'
  | 'password_reset_requested'
  | 'password_reset_completed';

export interface AuditLogPayload {
  organizationId: string;
  userId?: string;
  event: AuditEventType;
  payload?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AuditLogService - Centralized audit logging
 *
 * Inject this service into any module that needs to log events.
 * All events are stored with multi-tenant isolation.
 *
 * Usage:
 * await this.auditLog.log({
 *   organizationId: user.organizationId,
 *   userId: user.id,
 *   event: 'user_login',
 *   payload: { method: 'password' },
 *   ipAddress: req.ip,
 * });
 */
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogPayload): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          event: data.event,
          payload: data.payload || {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      // Don't let audit logging failures break the main flow
      console.error('Failed to write audit log:', error);
    }
  }

  async logBatch(events: AuditLogPayload[]): Promise<void> {
    try {
      await this.prisma.auditLog.createMany({
        data: events.map((e) => ({
          organizationId: e.organizationId,
          userId: e.userId,
          event: e.event,
          payload: e.payload || {},
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
        })),
      });
    } catch (error) {
      console.error('Failed to write batch audit logs:', error);
    }
  }
}
