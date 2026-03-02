import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Retourne l'organisation de l'utilisateur courant, avec le plan et le statut d'onboarding.
   */
  async findMine(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptionPlan: {
          select: {
            id: true,
            name: true,
            label: true,
            priceMonthly: true,
            maxUsers: true,
            maxKpis: true,
            hasNlq: true,
            hasAdvancedReports: true,
          },
        },
        onboardingStatus: true,
        _count: { select: { users: true, agents: true } },
      },
    });

    if (!org) {
      throw new NotFoundException('Organisation introuvable');
    }

    return org;
  }

  /**
   * Met à jour les informations de base de l'organisation.
   */
  async updateMine(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ) {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
      include: {
        subscriptionPlan: {
          select: { id: true, name: true, label: true },
        },
        onboardingStatus: true,
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'organization_updated',
      payload: { fields: Object.keys(dto) },
    });

    return updated;
  }
}
