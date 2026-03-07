import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WidgetsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retourne le catalogue Widget Store pour une organisation.
   * - Filtre les KPI packs selon les `allowedKpiPacks` du plan d'abonnement de l'org.
   * - Filtre optionnellement par profil métier.
   * - Inclut les KPI definitions enrichies et les widget templates disponibles.
   */
  async getStore(organizationId: string, profile?: string) {
    // Récupérer l'org avec son plan
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscriptionPlan: { select: { allowedKpiPacks: true } } },
    });

    const allowedPacks = org?.subscriptionPlan?.allowedKpiPacks ?? [];

    // Récupérer les KPI packs actifs (filtrés par plan + profil optionnel)
    const kpiPacks = await this.prisma.kpiPack.findMany({
      where: {
        isActive: true,
        ...(allowedPacks.length > 0 && { name: { in: allowedPacks } }),
        ...(profile && { profile: profile.toLowerCase() }),
      },
      orderBy: { profile: 'asc' },
    });

    // Récupérer toutes les KPI definitions actives
    const kpiDefinitions = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });

    // Récupérer tous les widget templates actifs
    const widgetTemplates = await this.prisma.widgetTemplate.findMany({
      where: { isActive: true },
      orderBy: { vizType: 'asc' },
    });

    // Construire une map kpiKey → définition pour enrichir les packs
    const kpiDefMap = new Map(kpiDefinitions.map((k) => [k.key, k]));

    const enrichedPacks = kpiPacks.map((pack) => ({
      ...pack,
      kpis: pack.kpiKeys.map((key) => kpiDefMap.get(key)).filter(Boolean),
    }));

    return {
      kpiPacks: enrichedPacks,
      kpiDefinitions,
      widgetTemplates,
    };
  }
}
