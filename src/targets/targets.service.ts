import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { PeriodType, TargetScenario, TargetValueType } from '@prisma/client';

// Plages valides de periodIndex selon le type de période
const PERIOD_INDEX_RANGES: Record<PeriodType, { min: number; max: number }> = {
  MENSUEL: { min: 1, max: 12 },
  BIMESTRE: { min: 1, max: 6 },
  TRIMESTRE: { min: 1, max: 4 },
  SEMESTRE: { min: 1, max: 2 },
  ANNEE: { min: 1, max: 1 },
};

@Injectable()
export class TargetsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(
    organizationId: string,
    filters: {
      kpiKey?: string;
      year?: number;
      periodType?: PeriodType;
      scenario?: TargetScenario;
    },
  ) {
    return this.prisma.target.findMany({
      where: {
        organizationId,
        ...(filters.kpiKey ? { kpiKey: filters.kpiKey } : {}),
        ...(filters.year ? { year: filters.year } : {}),
        ...(filters.periodType ? { periodType: filters.periodType } : {}),
        ...(filters.scenario ? { scenario: filters.scenario } : {}),
      },
      include: {
        kpiDefinition: {
          select: { key: true, name: true, unit: true, category: true, direction: true },
        },
      },
      orderBy: [{ year: 'desc' }, { periodType: 'asc' }, { periodIndex: 'asc' }, { scenario: 'asc' }],
    });
  }

  async findOne(id: string, organizationId: string) {
    const target = await this.prisma.target.findUnique({
      where: { id },
      include: {
        kpiDefinition: {
          select: { key: true, name: true, unit: true, category: true, direction: true },
        },
      },
    });

    if (!target) throw new NotFoundException('Objectif introuvable.');
    if (target.organizationId !== organizationId)
      throw new ForbiddenException('Accès refusé à cet objectif.');

    return target;
  }

  async create(organizationId: string, dto: CreateTargetDto, userId?: string) {
    // Validation : deltaReference requis si DELTA_PERCENT
    if (dto.valueType === TargetValueType.DELTA_PERCENT && !dto.deltaReference) {
      throw new BadRequestException(
        'deltaReference est requis quand valueType = DELTA_PERCENT.',
      );
    }

    // Validation : periodIndex dans la plage autorisée
    const range = PERIOD_INDEX_RANGES[dto.periodType];
    if (dto.periodIndex < range.min || dto.periodIndex > range.max) {
      throw new BadRequestException(
        `periodIndex invalide pour ${dto.periodType} : attendu entre ${range.min} et ${range.max}, reçu ${dto.periodIndex}.`,
      );
    }

    // Validation : le KPI existe
    const kpiDef = await this.prisma.kpiDefinition.findUnique({
      where: { key: dto.kpiKey },
    });
    if (!kpiDef) {
      throw new BadRequestException(`KPI introuvable : ${dto.kpiKey}.`);
    }

    // Upsert : si l'objectif existe déjà (même org/kpi/période/scénario), on le remplace
    const target = await this.prisma.target.upsert({
      where: {
        organizationId_kpiKey_periodType_periodIndex_year_scenario: {
          organizationId,
          kpiKey: dto.kpiKey,
          periodType: dto.periodType,
          periodIndex: dto.periodIndex,
          year: dto.year,
          scenario: dto.scenario,
        },
      },
      update: {
        value: dto.value,
        valueType: dto.valueType,
        deltaReference: dto.deltaReference ?? null,
        label: dto.label ?? null,
      },
      create: {
        organizationId,
        kpiKey: dto.kpiKey,
        value: dto.value,
        valueType: dto.valueType,
        deltaReference: dto.deltaReference ?? null,
        periodType: dto.periodType,
        periodIndex: dto.periodIndex,
        year: dto.year,
        scenario: dto.scenario,
        label: dto.label ?? null,
      },
      include: {
        kpiDefinition: {
          select: { key: true, name: true, unit: true, category: true, direction: true },
        },
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'target_created',
      payload: {
        targetId: target.id,
        kpiKey: dto.kpiKey,
        periodType: dto.periodType,
        periodIndex: dto.periodIndex,
        year: dto.year,
        scenario: dto.scenario,
        value: dto.value,
      },
    });

    return target;
  }

  async update(id: string, organizationId: string, dto: UpdateTargetDto, userId?: string) {
    const target = await this.prisma.target.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Objectif introuvable.');
    if (target.organizationId !== organizationId)
      throw new ForbiddenException('Accès refusé à cet objectif.');

    // Validation cohérence deltaReference si valueType change
    const newValueType = dto.valueType ?? target.valueType;
    const newDeltaReference = dto.deltaReference ?? target.deltaReference;
    if (newValueType === TargetValueType.DELTA_PERCENT && !newDeltaReference) {
      throw new BadRequestException(
        'deltaReference est requis quand valueType = DELTA_PERCENT.',
      );
    }

    const updated = await this.prisma.target.update({
      where: { id },
      data: {
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
        ...(dto.deltaReference !== undefined ? { deltaReference: dto.deltaReference } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
      },
      include: {
        kpiDefinition: {
          select: { key: true, name: true, unit: true, category: true, direction: true },
        },
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'target_updated',
      payload: { targetId: id, changes: dto },
    });

    return updated;
  }

  async remove(id: string, organizationId: string, userId?: string) {
    const target = await this.prisma.target.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Objectif introuvable.');
    if (target.organizationId !== organizationId)
      throw new ForbiddenException('Accès refusé à cet objectif.');

    await this.prisma.target.delete({ where: { id } });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'target_deleted',
      payload: {
        targetId: id,
        kpiKey: target.kpiKey,
        periodType: target.periodType,
        periodIndex: target.periodIndex,
        year: target.year,
        scenario: target.scenario,
      },
    });

    return { message: 'Objectif supprimé.' };
  }
}
