import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private readonly smtpConfigured: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.smtpConfigured = !!this.config.get<string>('SMTP_HOST');
  }

  onModuleInit() {
    if (!this.smtpConfigured) {
      this.logger.warn(
        'SMTP_HOST non configuré — les emails seront loggés en console uniquement (mode dev)',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT') ?? 587,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });

    this.logger.log(`SMTP configuré sur ${this.config.get('SMTP_HOST')}:${this.config.get('SMTP_PORT')}`);
  }

  async sendResetPasswordEmail(email: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] Reset password link for ${email}: ${resetLink}`);
      return;
    }

    const html = this.loadTemplate('reset-password.html', {
      resetLink,
      expiresIn: '1 heure',
    });

    await this.send({
      to: email,
      subject: 'Réinitialisation de votre mot de passe InsightSage',
      html,
    });
  }

  async sendInvitationEmail(
    email: string,
    token: string,
    orgName: string,
    role: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const invitationLink = `${frontendUrl}/accept-invitation?token=${token}`;

    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] Invitation link for ${email} (${orgName} / ${role}): ${invitationLink}`);
      return;
    }

    const html = this.loadTemplate('invitation.html', {
      invitationLink,
      orgName,
      role,
      expiresIn: '7 jours',
    });

    await this.send({
      to: email,
      subject: `Vous avez été invité à rejoindre ${orgName} sur InsightSage`,
      html,
    });
  }

  async sendWelcomeSetupEmail(
    email: string,
    token: string,
    orgName: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const setupLink = `${frontendUrl}/reset-password?token=${token}`;

    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] Welcome setup link for ${email} (${orgName}): ${setupLink}`);
      return;
    }

    const html = this.loadTemplate('welcome-setup.html', {
      setupLink,
      orgName,
    });

    await this.send({
      to: email,
      subject: `Bienvenue sur InsightSage — Configurez votre compte ${orgName}`,
      html,
    });
  }

  async sendTrialEndingEmail(
    email: string,
    firstName: string,
    orgName: string,
    trialEndsAt: Date,
    daysLeft: number,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const billingUrl = `${frontendUrl}/onboarding`;
    const formattedDate = trialEndsAt.toLocaleDateString('fr-FR');

    if (!this.smtpConfigured) {
      this.logger.log(
        `[DEV] Trial ending email for ${email} (${orgName}) — J-${daysLeft}, fin le ${formattedDate}`,
      );
      return;
    }

    const html = this.loadTemplate('trial-ending.html', {
      firstName,
      orgName,
      daysLeft: String(daysLeft),
      trialEndsAt: formattedDate,
      billingUrl,
    });

    await this.send({
      to: email,
      subject: `Cockpit — Votre essai se termine dans ${daysLeft} jour(s)`,
      html,
    });
  }

  async sendWelcomeEmail(
    email: string,
    firstName: string,
    orgName: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const dashboardUrl = `${frontendUrl}/onboarding`;

    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] Welcome email for ${email} (${orgName}): ${dashboardUrl}`);
      return;
    }

    const html = this.loadTemplate('welcome.html', {
      firstName,
      orgName,
      dashboardUrl,
    });

    await this.send({
      to: email,
      subject: `Bienvenue sur Cockpit — Votre espace ${orgName} est prêt`,
      html,
    });
  }

  async sendPaymentFailedAlert(
    email: string,
    recipientName: string,
    amountDue: number,
    currency: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const billingUrl = `${frontendUrl}/billing`;

    if (!this.smtpConfigured) {
      this.logger.log(
        `[DEV] Payment failed alert for ${email} — ${amountDue} ${currency}`,
      );
      return;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e53e3e;">Echec de paiement de votre abonnement Cockpit</h2>
        <p>Bonjour ${recipientName},</p>
        <p>
          Nous n\'avons pas pu prélever le montant de <strong>${amountDue} ${currency}</strong>
          correspondant a votre abonnement Cockpit.
        </p>
        <p>
          Flutterwave effectuera automatiquement de nouvelles tentatives de prelevement.
          Si le paiement reste en echec, votre acces sera suspendu.
        </p>
        <p>
          <a href="${billingUrl}" style="
            display: inline-block; padding: 12px 24px;
            background: #3182ce; color: white; text-decoration: none; border-radius: 6px;
          ">
            Mettre a jour mon moyen de paiement
          </a>
        </p>
        <p style="color: #718096; font-size: 12px;">
          Si vous pensez que c\'est une erreur, contactez notre support.
        </p>
      </div>
    `;

    await this.send({
      to: email,
      subject: 'Action requise — Echec de paiement de votre abonnement Cockpit',
      html,
    });
  }

  // ── Alertes admin (envoyées aux superadmins configurés dans SystemConfig) ────

  private adminHtml(
    headerColor: string,
    title: string,
    body: string,
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${headerColor}; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">${title}</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          ${body}
          <p style="color: #94a3b8; font-size: 11px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            Cockpit Administration — notification automatique
          </p>
        </div>
      </div>`;
  }

  async sendAdminNewOrgAlert(
    email: string,
    firstName: string | null | undefined,
    orgName: string,
    createdByEmail?: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const by = createdByEmail ? `<p>Créée par : <strong>${createdByEmail}</strong></p>` : '';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminNewOrgAlert → ${email} | org: ${orgName}`);
      return;
    }
    const html = this.adminHtml(
      '#3b82f6',
      '🏢 Nouvelle organisation créée',
      `<p>${greeting}</p>
       <p>Une nouvelle organisation vient d'être enregistrée sur Cockpit.</p>
       <p>Organisation : <strong>${orgName}</strong></p>
       ${by}`,
    );
    await this.send({ to: email, subject: `[Cockpit] Nouvelle organisation : ${orgName}`, html });
  }

  async sendAdminAgentOfflineAlert(
    email: string,
    firstName: string | null | undefined,
    agentName: string,
    orgName: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminAgentOfflineAlert → ${email} | agent: ${agentName} (${orgName})`);
      return;
    }
    const html = this.adminHtml(
      '#f97316',
      '⚠️ Agent hors ligne',
      `<p>${greeting}</p>
       <p>Un agent on-premise n'émet plus de heartbeat et a été marqué <strong>hors ligne</strong>.</p>
       <p>Agent : <strong>${agentName}</strong></p>
       <p>Organisation : <strong>${orgName}</strong></p>`,
    );
    await this.send({ to: email, subject: `[Cockpit] Agent hors ligne : ${agentName}`, html });
  }

  async sendAdminPaymentFailedAlert(
    email: string,
    firstName: string | null | undefined,
    orgName: string,
    amount?: number,
    currency?: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const amountLine = amount != null && currency
      ? `<p>Montant : <strong>${amount} ${currency.toUpperCase()}</strong></p>`
      : '';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminPaymentFailedAlert → ${email} | org: ${orgName}`);
      return;
    }
    const html = this.adminHtml(
      '#ef4444',
      '❌ Échec de paiement',
      `<p>${greeting}</p>
       <p>Un paiement a échoué pour l'organisation suivante.</p>
       <p>Organisation : <strong>${orgName}</strong></p>
       ${amountLine}`,
    );
    await this.send({ to: email, subject: `[Cockpit] Échec de paiement — ${orgName}`, html });
  }

  async sendAdminPaymentSuccessAlert(
    email: string,
    firstName: string | null | undefined,
    orgName: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminPaymentSuccessAlert → ${email} | org: ${orgName} — ${amount} ${currency}`);
      return;
    }
    const html = this.adminHtml(
      '#22c55e',
      '✅ Paiement reçu',
      `<p>${greeting}</p>
       <p>Un paiement a été reçu avec succès.</p>
       <p>Organisation : <strong>${orgName}</strong></p>
       <p>Montant : <strong>${amount} ${currency.toUpperCase()}</strong></p>`,
    );
    await this.send({ to: email, subject: `[Cockpit] Paiement reçu — ${orgName}`, html });
  }

  async sendAdminTokenExpiringSoonAlert(
    email: string,
    firstName: string | null | undefined,
    agentName: string,
    orgName: string,
    daysLeft: number,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const urgency = daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#f97316' : '#f59e0b';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminTokenExpiringSoonAlert → ${email} | agent: ${agentName} (${orgName}) — J-${daysLeft}`);
      return;
    }
    const html = this.adminHtml(
      urgency,
      `⏰ Token agent expire dans ${daysLeft} jour(s)`,
      `<p>${greeting}</p>
       <p>Le token de l'agent on-premise suivant expire dans <strong>${daysLeft} jour(s)</strong>.</p>
       <p>Agent : <strong>${agentName}</strong></p>
       <p>Organisation : <strong>${orgName}</strong></p>
       <p>Sans renouvellement, l'agent sera bloqué et les tableaux de bord ne pourront plus se rafraîchir.</p>
       <p><strong>Action requise :</strong> Régénérez le token depuis le portail d'administration, puis mettez à jour le fichier <code>config/config.yaml</code> de l'agent et redémarrez-le.</p>`,
    );
    await this.send({
      to: email,
      subject: `[Cockpit] Token agent expire dans ${daysLeft} jour(s) — ${agentName}`,
      html,
    });
  }

  async sendAdminErrorLogAlert(
    email: string,
    firstName: string | null | undefined,
    eventType: string,
    orgName?: string,
    details?: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const orgLine = orgName ? `<p>Organisation : <strong>${orgName}</strong></p>` : '';
    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminErrorLogAlert → ${email} | event: ${eventType}${orgName ? ` (${orgName})` : ''}`);
      return;
    }

    // Cas particulier : token expiré → message actionnable, pas d'alerte rouge générique
    if (eventType === 'agent_token_expired') {
      const html = this.adminHtml(
        '#f97316',
        '⚠️ Token agent expiré',
        `<p>${greeting}</p>
         <p>Un agent on-premise tente de se connecter avec un token expiré.</p>
         ${orgLine}
         <p><strong>Action requise :</strong> Régénérez le token depuis le portail d'administration, puis mettez à jour le fichier <code>config/config.yaml</code> de l'agent et redémarrez-le.</p>`,
      );
      return this.send({ to: email, subject: `[Cockpit] Token agent expiré — action requise`, html });
    }

    const detailLine = details
      ? `<p>Détail : <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${details}</code></p>`
      : '';
    const html = this.adminHtml(
      '#dc2626',
      '🚨 Erreur système détectée',
      `<p>${greeting}</p>
       <p>Un événement d'erreur a été enregistré dans les logs d'audit.</p>
       <p>Événement : <strong>${eventType}</strong></p>
       ${orgLine}
       ${detailLine}`,
    );
    await this.send({ to: email, subject: `[Cockpit] Erreur : ${eventType}`, html });
  }

  async sendAdminBugReportAlert(
    email: string,
    firstName: string | null | undefined,
    id: string, // UUID interne
    bugId: string, // ID lisible (BR-...)
    title: string,
    orgName: string | undefined,
    priority: string,
    submittedBy: string,
  ): Promise<void> {
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const orgLine = orgName ? `<p>Organisation : <strong>${orgName}</strong></p>` : '';
    
    // Couleur de l'entête selon la priorité
    const priorityColors: Record<string, string> = {
      'critique': '#dc2626',
      'haute': '#ef4444',
      'moyenne': '#f97316',
      'basse': '#3b82f6',
      'a_analyser': '#64748b'
    };
    const headerColor = priorityColors[priority] || '#64748b';

    if (!this.smtpConfigured) {
      this.logger.log(`[DEV] sendAdminBugReportAlert → ${email} | bug: ${bugId} | priority: ${priority}`);
      return;
    }

    const html = this.adminHtml(
      headerColor,
      `🐛 Nouveau bug signalé : ${bugId}`,
      `<p>${greeting}</p>
       <p>Un nouveau signalement de bug vient d'être soumis.</p>
       <p>Titre : <strong>${title}</strong></p>
       <p>Priorité : <strong style="text-transform: capitalize;">${priority}</strong></p>
       ${orgLine}
       <p>Signalé par : <strong>${submittedBy}</strong></p>
       <p style="margin-top: 24px;">
         <a href="${this.config.get<string>('FRONTEND_ADMIN_URL') || this.config.get<string>('FRONTEND_URL')}/bug-tracker/${id}" style="
           display: inline-block; padding: 10px 20px;
           background: ${headerColor}; color: white; text-decoration: none; border-radius: 6px;
           font-weight: bold;
         ">
           Voir le bug dans le cockpit
         </a>
       </p>`,
    );

    await this.send({ 
      to: email, 
      subject: `[Cockpit] Bug ${bugId} : ${title}`, 
      html 
    });
  }

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      await this.transporter!.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        ...options,
      });
      this.logger.log(`Email envoyé à ${options.to} — "${options.subject}"`);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Échec envoi email à ${options.to} — "${options.subject}": ${message}`,
        (error as Error).stack,
      );
      this.prisma.auditLog.create({
        data: {
          event: 'email_send_failed',
          payload: { subject: options.subject, error: message },
        },
      }).catch(() => {});
      throw error;
    }
  }

  private loadTemplate(filename: string, variables: Record<string, string>): string {
    // Essayer d'abord dans le dossier dist (production), sinon dans src (dev basique)
    const possiblePaths = [
      path.join(process.cwd(), 'dist', 'src', 'mailer', 'templates', filename),
      path.join(process.cwd(), 'src', 'mailer', 'templates', filename),
      path.join(__dirname, 'templates', filename)
    ];

    let templatePath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        templatePath = p;
        break;
      }
    }

    if (!templatePath) {
      this.logger.error(`Template email introuvable: ${filename}`);
      throw new Error(`Template email introuvable: ${filename}. Avez-vous recompilé le projet ?`);
    }

    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return html;
  }
}
