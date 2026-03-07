import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class LicenseGuardianService {
    constructor(private prisma: PrismaService) { }

    /**
     * Vérifie une limite numérique (ex: maxUsers) et lève une exception si elle est dépassée.
     */
    async assertLimit(organizationId: string, limitType: keyof SubscriptionPlan) {
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: { subscriptionPlan: true },
        });

        if (!org) throw new NotFoundException('Organisation introuvable.');

        // Si pas de plan ou plan inactif, on considère que c'est le plan gratuit par défaut (optionnel selon votre logique)
        const plan = org.subscriptionPlan;
        if (!plan) return; // Ou lever une erreur si le plan est obligatoire

        const limitValue = plan[limitType];

        // Si la limite est nulle, c'est illimité
        if (limitValue === null || limitValue === undefined) return;

        // Calcul de la consommation actuelle selon le type de limite
        let currentUsage = 0;
        switch (limitType) {
            case 'maxUsers':
                const userCount = await this.prisma.user.count({ where: { organizationId } });
                const pendingInvitationsCount = await this.prisma.invitation.count({
                    where: {
                        organizationId,
                        isAccepted: false,
                        expiresAt: { gte: new Date() } // Only count active ones
                    }
                });
                currentUsage = userCount + pendingInvitationsCount;
                break;
            case 'maxWidgets':
                currentUsage = await this.prisma.widget.count({ where: { organizationId } });
                break;
            case 'maxKpis':
                // À adapter selon la définition de "KPI" dans votre projet
                currentUsage = await this.prisma.widget.count({
                    where: { organizationId, type: 'kpi' }
                });
                break;
            case 'maxAgentSyncPerDay':
                // Temporairement désactivé : Le client veut supprimer cette limite (Sujet: Removal of Sync Limit)
                return;
            /*
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setHours(23, 59, 59, 999);

            currentUsage = await this.prisma.agentJob.count({
                where: {
                    organizationId,
                    createdAt: {
                        gte: start,
                        lte: end,
                    },
                },
            });
            break;
            */
            default:
                return; // Limite non gérée numériquement ici
        }

        if (currentUsage >= (limitValue as number)) {
            throw new ForbiddenException(
                `Limite atteinte : Votre forfait autorise maximum ${limitValue} ${this.getLabel(limitType)}.`,
            );
        }
    }

    /**
     * Vérifie si une fonctionnalité est débloquée dans le plan actuel.
     */
    async canAccessFeature(organizationId: string, feature: keyof SubscriptionPlan): Promise<boolean> {
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: { subscriptionPlan: true },
        });

        if (!org || !org.subscriptionPlan) return false;

        const featureValue = org.subscriptionPlan[feature];
        return !!featureValue;
    }

    /**
     * Helper pour les messages d'erreur.
     */
    private getLabel(limitType: keyof SubscriptionPlan): string {
        const labels: Record<string, string> = {
            maxUsers: 'utilisateurs',
            maxWidgets: 'widgets',
            maxKpis: 'KPIs',
            maxAgentSyncPerDay: 'synchronisations par jour',
        };
        return labels[limitType as string] || limitType as string;
    }
}
