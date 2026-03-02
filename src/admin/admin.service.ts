import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { AuditLogService } from '../logs/audit-log.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async createClientAccount(dto: CreateClientDto) {
    // 1. Verify if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists.');
    }

    // 2. We use a transaction to ensure both Org and User are created at the same time
    return this.prisma.$transaction(async (tx) => {
      // A. Create the Organization
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          size: 'pme', // Default or based on future DTO extensions
        },
      });

      // B. Get the 'daf' system role ID
      const dafRole = await tx.role.findFirst({
        where: { name: 'daf', isSystem: true, organizationId: null },
      });
      if (!dafRole) {
        throw new BadRequestException(
          'System roles not found. Please run database seed.',
        );
      }

      // C. Prepare the Welcome / Reset Password Token
      const token = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpires = new Date(Date.now() + 7 * 24 * 3600000); // 7 days max to click

      // Generate a random temporary password (never communicated, just to satisfy the DB schema)
      const randomTempPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomTempPassword, 10);

      // D. Create the Root User
      const user = await tx.user.create({
        data: {
          email: dto.adminEmail,
          passwordHash,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          organizationId: organization.id,
          resetPasswordToken: token,
          resetPasswordExpires,
          userRoles: {
            create: [{ roleId: dafRole.id }],
          },
        },
      });

      // D. Set User as the Organization Owner
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerId: user.id },
      });

      // E. (Optional / ToDo) Send Welcome Email with the link:
      // https://your-front.com/reset-password?token=${token}

      await this.auditLog.log({
        organizationId: organization.id,
        userId: user.id,
        event: 'organization_created',
        payload: {
          action: 'client_onboarding',
          organizationName: organization.name,
        },
      });

      return {
        message: 'Client organization and root user created successfully.',
        organizationId: organization.id,
        userId: user.id,
        debug: {
          // Temporarily return the reset token here so you can test the onboarding flow
          // without an actual email provider in place yet.
          setupToken: token,
        },
      };
    });
  }

  // --- Organizations Management ---

  async findAllOrganizations() {
    return this.prisma.organization.findMany({
      include: {
        _count: {
          select: { users: true, dashboards: true },
        },
        owner: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: dto,
    });

    await this.auditLog.log({
      organizationId: id,
      event: 'organization_updated',
      payload: { changes: dto },
    });

    return organization;
  }

  async deleteOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    const deleted = await this.prisma.organization.delete({
      where: { id },
    });

    if (organization) {
      await this.auditLog.log({
        organizationId: id,
        event: 'organization_deleted',
        payload: { organizationName: organization.name },
      });
    }

    return deleted;
  }

  // --- Users Management ---

  async findAllUsers() {
    return this.prisma.user.findMany({
      include: {
        organization: {
          select: { name: true },
        },
        userRoles: {
          include: {
            role: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'user_updated',
      payload: { changes: dto },
    });

    return user;
  }

  async deleteUser(id: string) {
    // Fetch before delete to capture organizationId for the audit log
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, organizationId: true, email: true },
    });

    const deleted = await this.prisma.user.delete({
      where: { id },
    });

    if (user) {
      await this.auditLog.log({
        organizationId: user.organizationId,
        event: 'user_deleted',
        payload: { deletedUserId: user.id, email: user.email },
      });
    }

    return deleted;
  }

  // --- Audit Logs ---

  async findAllAuditLogs() {
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: {
          user: {
            select: { email: true, firstName: true, lastName: true },
          },
          organization: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data: logs,
      meta: {
        total,
        limit: 100,
        offset: 0,
        hasMore: total > 100,
      },
    };
  }

  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Organizations
    const totalOrganizations = await this.prisma.organization.count();
    const orgs30DaysAgo = await this.prisma.organization.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    const orgTrend = totalOrganizations - orgs30DaysAgo;

    // Users
    const totalUsers = await this.prisma.user.count();
    const users30DaysAgo = await this.prisma.user.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    const userTrend = totalUsers - users30DaysAgo;

    // Agents
    const agents = await this.prisma.agent.findMany();
    const activeAgents = agents.filter((a) => a.status === 'online').length;
    const errorAgents = agents.filter((a) => a.status === 'error').length;
    const offlineAgents = agents.filter(
      (a) => a.status !== 'online' && a.status !== 'error',
    ).length;

    const agents30DaysAgo = await this.prisma.agent.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    const agentTrend = agents.length - agents30DaysAgo;

    // Recent activity: daily new users + new agents for last 7 days
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(today);
      dayStart.setDate(today.getDate() - (6 - i));
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);
      return { dayStart, dayEnd };
    });

    const activityCounts = await Promise.all(
      days.map(({ dayStart, dayEnd }) =>
        Promise.all([
          this.prisma.user.count({
            where: { createdAt: { gte: dayStart, lt: dayEnd } },
          }),
          this.prisma.agent.count({
            where: { createdAt: { gte: dayStart, lt: dayEnd } },
          }),
        ]),
      ),
    );

    const recentActivity = activityCounts.map(([users, agentsCount], i) => ({
      date: days[i].dayStart.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
      }),
      users,
      agents: agentsCount,
    }));

    // Agents distribution by status
    const agentsDistribution = [
      { name: 'Online', value: activeAgents, color: '#22c55e' },
      { name: 'Hors ligne', value: offlineAgents, color: '#94a3b8' },
      { name: 'Erreur', value: errorAgents, color: '#ef4444' },
    ];

    return {
      organizations: {
        value: totalOrganizations,
        trend: orgTrend >= 0 ? `+${orgTrend}` : `${orgTrend}`,
      },
      users: {
        value: totalUsers,
        trend: userTrend >= 0 ? `+${userTrend}` : `${userTrend}`,
      },
      activeAgents: {
        value: activeAgents,
        trend: agentTrend >= 0 ? `+${agentTrend}` : `${agentTrend}`,
      },
      errorAgents: {
        value: errorAgents,
        trend: '0',
      },
      recentActivity,
      agentsDistribution,
    };
  }
}
