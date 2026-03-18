import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  // ── Privés ──────────────────────────────────────────────────────────────────

  private async getConfig(): Promise<{
    notif: Record<string, boolean>;
    recipients: string[];
  }> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 'default' },
    });
    const prefs = config?.notificationPreferences as {
      notif?: Record<string, boolean>;
      recipients?: string[];
    } | null;
    return {
      notif: prefs?.notif ?? {},
      recipients: prefs?.recipients ?? [],
    };
  }

  private async resolveRecipients(
    ids: string[],
  ): Promise<{ email: string; firstName?: string | null }[]> {
    if (!ids.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { email: true, firstName: true },
    });
  }

  /** Si la valeur ressemble à un UUID → requête Prisma pour obtenir le nom d'org */
  private async resolveOrgName(orgIdOrName: string): Promise<string> {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orgIdOrName)) {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgIdOrName },
        select: { name: true },
      });
      return org?.name ?? orgIdOrName;
    }
    return orgIdOrName;
  }

  // ── Publics ──────────────────────────────────────────────────────────────────

  async notifyNewOrg(orgName: string, createdByEmail?: string): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    if (!notif.newOrg || !recipients.length) return;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminNewOrgAlert(u.email, u.firstName, orgName, createdByEmail),
      ),
    );
    this.logger.log(`[notifyNewOrg] Alertes envoyées pour "${orgName}" à ${users.length} admin(s)`);
  }

  async notifyAgentOffline(agentName: string, orgName: string): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    if (!notif.agentOffline || !recipients.length) return;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminAgentOfflineAlert(u.email, u.firstName, agentName, orgName),
      ),
    );
    this.logger.log(`[notifyAgentOffline] Alertes envoyées pour agent "${agentName}" à ${users.length} admin(s)`);
  }

  async notifyPaymentFailed(
    orgIdOrName: string,
    amount?: number,
    currency?: string,
  ): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    if (!notif.paymentFailed || !recipients.length) return;
    const orgName = await this.resolveOrgName(orgIdOrName);
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminPaymentFailedAlert(u.email, u.firstName, orgName, amount, currency),
      ),
    );
    this.logger.log(`[notifyPaymentFailed] Alertes envoyées pour "${orgName}" à ${users.length} admin(s)`);
  }

  async notifyPaymentSuccess(
    orgName: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    if (!notif.paymentSuccess || !recipients.length) return;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminPaymentSuccessAlert(u.email, u.firstName, orgName, amount, currency),
      ),
    );
    this.logger.log(`[notifyPaymentSuccess] Alertes envoyées pour "${orgName}" à ${users.length} admin(s)`);
  }

  async notifyErrorLog(
    eventType: string,
    orgIdOrName?: string | null,
    details?: string,
  ): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    if (!notif.errorLogs || !recipients.length) return;
    const orgName = orgIdOrName ? await this.resolveOrgName(orgIdOrName) : undefined;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminErrorLogAlert(u.email, u.firstName, eventType, orgName, details),
      ),
    );
    this.logger.log(`[notifyErrorLog] Alertes envoyées pour événement "${eventType}" à ${users.length} admin(s)`);
  }
}
