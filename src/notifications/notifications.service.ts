import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

/** Cooldown entre deux alertes identiques : 1 heure */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Map<clé_alerte, timestamp_dernier_envoi> — déduplication en mémoire */
  private readonly alertCooldowns = new Map<string, number>();

  private isCoolingDown(key: string, cooldownMs = ALERT_COOLDOWN_MS): boolean {
    const last = this.alertCooldowns.get(key);
    return last !== undefined && Date.now() - last < cooldownMs;
  }

  private markAlertSent(key: string): void {
    this.alertCooldowns.set(key, Date.now());
  }

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

    let recipientIds = prefs?.recipients ?? [];

    // Fallback : uniquement si jamais configuré (recipients undefined), pas si explicitement vidé ([])
    if (prefs?.recipients === undefined && recipientIds.length === 0) {
      const superadmins = await this.prisma.userRole.findMany({
        where: { role: { name: 'superadmin' } },
        select: { userId: true },
      });
      recipientIds = superadmins.map((sa) => sa.userId);
    }

    return {
      notif: prefs?.notif ?? {},
      recipients: recipientIds,
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
    const cooldownKey = `agentOffline:${agentName}`;
    if (this.isCoolingDown(cooldownKey)) return;
    const { notif, recipients } = await this.getConfig();
    if (!notif.agentOffline || !recipients.length) return;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminAgentOfflineAlert(u.email, u.firstName, agentName, orgName),
      ),
    );
    this.markAlertSent(cooldownKey);
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

  async notifyTokenExpiringSoon(
    agentId: string,
    agentName: string,
    orgName: string,
    daysLeft: number,
  ): Promise<void> {
    // Cooldown 23h : un seul email par seuil (J-7, J-3, J-1) par agent
    const cooldownKey = `tokenExpiry:${agentId}:J${daysLeft}`;
    if (this.isCoolingDown(cooldownKey, 23 * 60 * 60 * 1000)) return;
    const { notif, recipients } = await this.getConfig();
    // Activé par défaut (notif.agentTokenExpiry !== false) sauf si explicitement désactivé
    if (notif.agentTokenExpiry === false || !recipients.length) return;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminTokenExpiringSoonAlert(u.email, u.firstName, agentName, orgName, daysLeft),
      ),
    );
    this.markAlertSent(cooldownKey);
    this.logger.log(`[notifyTokenExpiringSoon] Alertes J-${daysLeft} envoyées pour agent "${agentName}" à ${users.length} admin(s)`);
  }

  async notifyErrorLog(
    eventType: string,
    orgIdOrName?: string | null,
    details?: string,
  ): Promise<void> {
    const cooldownKey = `errorLog:${eventType}:${orgIdOrName ?? 'global'}`;
    if (this.isCoolingDown(cooldownKey)) return;
    const { notif, recipients } = await this.getConfig();
    if (!notif.errorLogs || !recipients.length) return;
    const orgName = orgIdOrName ? await this.resolveOrgName(orgIdOrName) : undefined;
    const users = await this.resolveRecipients(recipients);
    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminErrorLogAlert(u.email, u.firstName, eventType, orgName, details),
      ),
    );
    this.markAlertSent(cooldownKey);
    this.logger.log(`[notifyErrorLog] Alertes envoyées pour événement "${eventType}" à ${users.length} admin(s)`);
  }

  async notifyBugSubmitted(bug: any, submitter: any): Promise<void> {
    if (!submitter?.email) return;
    const { notif } = await this.getConfig();
    if (notif.bugReports === false) return;
    const emails = [submitter.email, ...(bug.notify_emails ?? [])].filter(Boolean);
    await Promise.allSettled(
      emails.map((email: string) =>
        this.mailer.sendBugSubmittedEmail(email, submitter.firstName, bug.bugId, bug.title),
      ),
    );
    this.logger.log(`[notifyBugSubmitted] Confirmation envoyée pour bug "${bug.bugId}" à ${emails.length} destinataire(s)`);
  }

  async notifyBugResolved(bug: any, submitter: { email: string; firstName?: string | null }): Promise<void> {
    if (!submitter?.email) return;
    const { notif } = await this.getConfig();
    if (notif.bugReports === false) return;
    const emails = [submitter.email, ...(bug.notify_emails ?? [])].filter(Boolean);
    await Promise.allSettled(
      emails.map((email: string) =>
        this.mailer.sendBugResolvedEmail(email, submitter.firstName ?? undefined, bug.bugId, bug.title),
      ),
    );
    this.logger.log(`[notifyBugResolved] Notification envoyée pour bug "${bug.bugId}" à ${emails.length} destinataire(s)`);
  }

  async notifyNewBug(bug: any, organizationId?: string): Promise<void> {
    const { notif, recipients } = await this.getConfig();
    
    // On active par défaut si non précisé, ou si explicitement true
    if (notif.bugReports === false || !recipients.length) return;

    const orgName = organizationId ? await this.resolveOrgName(organizationId) : undefined;
    const users = await this.resolveRecipients(recipients);
    
    const submittedBy = bug.submittedBy 
      ? `${bug.submittedBy.firstName} ${bug.submittedBy.lastName} (${bug.submittedBy.email})`
      : 'Utilisateur inconnu';

    await Promise.allSettled(
      users.map((u) =>
        this.mailer.sendAdminBugReportAlert(
          u.email,
          u.firstName,
          bug.id,
          bug.bugId,
          bug.title,
          orgName,
          bug.priority,
          submittedBy
        ),
      ),
    );
    this.logger.log(`[notifyNewBug] Alertes envoyées pour bug "${bug.bugId}" à ${users.length} admin(s)`);
  }
}
