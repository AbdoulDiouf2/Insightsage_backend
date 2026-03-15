import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private readonly smtpConfigured: boolean;

  constructor(private readonly config: ConfigService) {
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

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      await this.transporter!.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        ...options,
      });
      this.logger.log(`Email envoyé à ${options.to} — "${options.subject}"`);
    } catch (error) {
      this.logger.error(`Échec envoi email à ${options.to}: ${(error as Error).message}`);
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
