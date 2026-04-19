import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  CreateWidgetTemplateDto,
  UpdateWidgetTemplateDto,
  CreateKpiPackDto,
  UpdateKpiPackDto,
} from '../admin/dto/kpi-store.dto';

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

  // ─── KPI Definitions ─────────────────────────────────────────────────────

  async createKpiDefinition(dto: CreateKpiDefinitionDto) {
    const existing = await this.prisma.kpiDefinition.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException(`Une KPI Definition avec la clé "${dto.key}" existe déjà.`);
    }
    return this.prisma.kpiDefinition.create({ data: dto });
  }

  async updateKpiDefinition(id: string, dto: UpdateKpiDefinitionDto) {
    const kpi = await this.prisma.kpiDefinition.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException(`KPI Definition introuvable : ${id}`);
    return this.prisma.kpiDefinition.update({ where: { id }, data: dto });
  }

  async toggleKpiDefinition(id: string) {
    const kpi = await this.prisma.kpiDefinition.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException(`KPI Definition introuvable : ${id}`);
    return this.prisma.kpiDefinition.update({ where: { id }, data: { isActive: !kpi.isActive } });
  }

  // ─── Widget Templates ─────────────────────────────────────────────────────

  async createWidgetTemplate(dto: CreateWidgetTemplateDto) {
    const existing = await this.prisma.widgetTemplate.findUnique({ where: { vizType: dto.vizType } });
    if (existing) {
      throw new BadRequestException(`Un Widget Template avec vizType "${dto.vizType}" existe déjà.`);
    }
    return this.prisma.widgetTemplate.create({
      data: { ...dto, defaultConfig: dto.defaultConfig as Prisma.InputJsonValue },
    });
  }

  async updateWidgetTemplate(id: string, dto: UpdateWidgetTemplateDto) {
    const template = await this.prisma.widgetTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Widget Template introuvable : ${id}`);
    return this.prisma.widgetTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultConfig !== undefined && { defaultConfig: dto.defaultConfig as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async toggleWidgetTemplate(id: string) {
    const template = await this.prisma.widgetTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Widget Template introuvable : ${id}`);
    return this.prisma.widgetTemplate.update({ where: { id }, data: { isActive: !template.isActive } });
  }

  // ─── KPI Packs ─────────────────────────────────────────────────────────────

  async createKpiPack(dto: CreateKpiPackDto) {
    const existing = await this.prisma.kpiPack.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Un KPI Pack avec le nom "${dto.name}" existe déjà.`);
    }
    return this.prisma.kpiPack.create({ data: dto });
  }

  async updateKpiPack(id: string, dto: UpdateKpiPackDto) {
    const pack = await this.prisma.kpiPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException(`KPI Pack introuvable : ${id}`);
    return this.prisma.kpiPack.update({ where: { id }, data: dto });
  }

  async toggleKpiPack(id: string) {
    const pack = await this.prisma.kpiPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException(`KPI Pack introuvable : ${id}`);
    return this.prisma.kpiPack.update({ where: { id }, data: { isActive: !pack.isActive } });
  }
}
