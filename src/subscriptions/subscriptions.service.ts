import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retourne les plans d'abonnement actifs, triés par sortOrder.
   * Les plans sont persistés en BDD pour une gestion dynamique sans redéploiement.
   */
  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        label: true,
        description: true,
        priceMonthly: true,
        maxUsers: true,
        maxKpis: true,
        maxWidgets: true,
        maxAgentSyncPerDay: true,
        allowedKpiPacks: true,
        hasNlq: true,
        hasAdvancedReports: true,
        sortOrder: true,
        // Exclus : fwPlanId (interne)
      },
    });
  }

  async findById(id: string) {
    return this.prisma.subscriptionPlan.findUnique({ where: { id } });
  }

  async findByName(name: string) {
    return this.prisma.subscriptionPlan.findUnique({ where: { name } });
  }
}
