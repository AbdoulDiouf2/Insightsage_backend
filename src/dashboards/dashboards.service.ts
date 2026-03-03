import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { AddWidgetDto } from './dto/add-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';

@Injectable()
export class DashboardsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ─── Dashboards ─────────────────────────────────────────────────────────────

  async findMine(userId: string, organizationId: string) {
    // Retourne le dashboard isDefault=true de l'utilisateur, sinon le premier
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { userId, organizationId, isDefault: true },
      include: { widgets: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } },
    });

    if (dashboard) return dashboard;

    // Fallback : premier dashboard de l'utilisateur
    return this.prisma.dashboard.findFirst({
      where: { userId, organizationId },
      include: { widgets: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.dashboard.findMany({
      where: { organizationId },
      include: {
        _count: { select: { widgets: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, organizationId },
      include: {
        widgets: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard introuvable');
    }

    return dashboard;
  }

  async create(userId: string, organizationId: string, dto: CreateDashboardDto) {
    // Si isDefault=true, on réinitialise les autres dashboards default de cet utilisateur
    if (dto.isDefault) {
      await this.prisma.dashboard.updateMany({
        where: { userId, organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await this.prisma.dashboard.create({
      data: {
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        layout: [],
        userId,
        organizationId,
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'dashboard_created',
      payload: { dashboardId: dashboard.id, name: dashboard.name },
    });

    return dashboard;
  }

  async update(id: string, userId: string, organizationId: string, dto: UpdateDashboardDto) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard introuvable');
    }

    // Seul le propriétaire ou un admin peut modifier
    if (dashboard.userId !== userId) {
      throw new ForbiddenException('Accès non autorisé à ce dashboard');
    }

    // Si passage en isDefault=true, reset les autres
    if (dto.isDefault === true) {
      await this.prisma.dashboard.updateMany({
        where: { userId, organizationId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.dashboard.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.layout !== undefined && { layout: dto.layout as Prisma.InputJsonValue }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'dashboard_updated',
      payload: { dashboardId: id, fields: Object.keys(dto) },
    });

    return updated;
  }

  async remove(id: string, userId: string, organizationId: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard introuvable');
    }

    if (dashboard.userId !== userId) {
      throw new ForbiddenException('Accès non autorisé à ce dashboard');
    }

    await this.prisma.dashboard.delete({ where: { id } });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'dashboard_deleted',
      payload: { dashboardId: id, name: dashboard.name },
    });

    return { message: 'Dashboard supprimé avec succès' };
  }

  // ─── Widgets dans un dashboard ───────────────────────────────────────────────

  async addWidget(
    dashboardId: string,
    userId: string,
    organizationId: string,
    dto: AddWidgetDto,
  ) {
    // Vérification que le dashboard appartient bien à cette org
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard introuvable');
    }

    // Vérification limite maxWidgets du plan d'abonnement
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscriptionPlan: { select: { maxWidgets: true } } },
    });

    if (org?.subscriptionPlan?.maxWidgets !== null && org?.subscriptionPlan?.maxWidgets !== undefined) {
      const widgetCount = await this.prisma.widget.count({
        where: { organizationId },
      });

      if (widgetCount >= org.subscriptionPlan.maxWidgets) {
        throw new BadRequestException(
          `Limite de widgets atteinte (${org.subscriptionPlan.maxWidgets} max selon votre plan)`,
        );
      }
    }

    const widget = await this.prisma.widget.create({
      data: {
        name: dto.name,
        type: dto.type,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        exposure: dto.exposure,
        vizType: dto.vizType,
        position: dto.position as unknown as Prisma.InputJsonValue,
        isActive: true,
        dashboardId,
        userId,
        organizationId,
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'widget_added',
      payload: {
        widgetId: widget.id,
        dashboardId,
        name: widget.name,
        type: widget.type,
        kpiKey: dto.kpiKey,
      },
    });

    return widget;
  }

  async updateWidget(
    widgetId: string,
    dashboardId: string,
    userId: string,
    organizationId: string,
    dto: UpdateWidgetDto,
  ) {
    const widget = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId, organizationId },
    });

    if (!widget) {
      throw new NotFoundException('Widget introuvable');
    }

    const updated = await this.prisma.widget.update({
      where: { id: widgetId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.config !== undefined && { config: dto.config as Prisma.InputJsonValue }),
        ...(dto.vizType !== undefined && { vizType: dto.vizType }),
        ...(dto.position !== undefined && { position: dto.position as unknown as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'widget_updated',
      payload: { widgetId, dashboardId, fields: Object.keys(dto) },
    });

    return updated;
  }

  async removeWidget(
    widgetId: string,
    dashboardId: string,
    userId: string,
    organizationId: string,
  ) {
    const widget = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId, organizationId },
    });

    if (!widget) {
      throw new NotFoundException('Widget introuvable');
    }

    await this.prisma.widget.delete({ where: { id: widgetId } });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'widget_removed',
      payload: { widgetId, dashboardId, name: widget.name },
    });

    return { message: 'Widget supprimé avec succès' };
  }

  // ─── KPI Packs ───────────────────────────────────────────────────────────────

  async getKpiPacks(profile?: string) {
    const packs = await this.prisma.kpiPack.findMany({
      where: {
        isActive: true,
        ...(profile && { profile: profile.toLowerCase() }),
      },
      orderBy: { profile: 'asc' },
    });

    // Enrichir chaque pack avec les détails des KPI definitions
    const kpiDefs = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true },
    });

    const kpiDefMap = new Map(kpiDefs.map((k) => [k.key, k]));

    return packs.map((pack) => ({
      ...pack,
      kpis: pack.kpiKeys.map((key) => kpiDefMap.get(key)).filter(Boolean),
    }));
  }
}
