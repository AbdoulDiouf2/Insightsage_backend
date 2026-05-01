import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { JobRegistryService } from '../health/job-registry.service';
import { differenceInCalendarDays } from 'date-fns';

/** Jours avant la fin d'essai auxquels on envoie un rappel. */
const REMINDER_DAYS = [3, 1];

@Injectable()
export class BillingSchedulerService {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly jobRegistry: JobRegistryService,
  ) {}

  @Cron('0 8 * * *', { name: 'trial-ending-reminders' })
  async sendTrialEndingReminders(): Promise<void> {
    await this.jobRegistry.run('Rappels fin d\'essai', () => this._sendTrialEndingReminders()).catch(() => {});
  }

  private async _sendTrialEndingReminders(): Promise<void> {
    this.logger.log('Vérification des fins de période d\'essai...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: {
        status: 'TRIALING',
        trialEndsAt: { not: null },
      },
      include: {
        organization: {
          include: {
            owner: { select: { email: true, firstName: true } },
          },
        },
      },
    });

    let sent = 0;

    for (const sub of subscriptions) {
      if (!sub.trialEndsAt) continue;

      const trialEnd = new Date(sub.trialEndsAt);
      trialEnd.setHours(0, 0, 0, 0);
      const daysLeft = differenceInCalendarDays(trialEnd, today);

      if (!REMINDER_DAYS.includes(daysLeft)) continue;

      const owner = sub.organization?.owner;
      if (!owner?.email) continue;

      try {
        await this.mailer.sendTrialEndingEmail(
          owner.email,
          owner.firstName ?? sub.organization.name,
          sub.organization.name,
          sub.trialEndsAt,
          daysLeft,
        );
        sent++;
        this.logger.log(
          `Rappel J-${daysLeft} envoyé à ${owner.email} (org: ${sub.organization.name})`,
        );
      } catch (err) {
        this.logger.error(
          `Échec envoi rappel essai pour org ${sub.organizationId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Rappels essai envoyés : ${sent} / ${subscriptions.length} abonnements en essai`);
  }
}

