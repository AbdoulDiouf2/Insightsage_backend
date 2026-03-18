import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogFilters {
  userId?: string;
  event?: string;
  events?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, filters: AuditLogFilters = {}) {
    const {
      userId,
      event,
      events,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const where: any = {
      organizationId,
    };

    if (userId) {
      where.userId = userId;
    }

    if (events && events.length > 0) {
      where.event = { in: events };
    } else if (event) {
      where.event = { contains: event, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          organization: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100), // Max 100 per request
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      },
    };
  }

  async findById(id: string, organizationId: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!log) {
      throw new NotFoundException(`Audit log ${id} not found`);
    }

    return log;
  }

  async getEventTypes(organizationId: string) {
    const events = await this.prisma.auditLog.groupBy({
      by: ['event'],
      where: { organizationId },
      _count: { event: true },
      orderBy: { _count: { event: 'desc' } },
    });

    return events.map((e) => ({
      event: e.event,
      count: e._count.event,
    }));
  }
}
