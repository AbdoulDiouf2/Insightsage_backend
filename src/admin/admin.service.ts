import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { AdminUpdateOrganizationDto } from './dto/update-organization.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from './dto/subscription-plan.dto';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  CreateWidgetTemplateDto,
  UpdateWidgetTemplateDto,
  CreateKpiPackDto,
  UpdateKpiPackDto,
} from './dto/kpi-store.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { AuditLogService } from '../logs/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private mailer: MailerService,
    private notifications: NotificationsService,
  ) { }

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
          planId: dto.planId || null,
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

      // E. Send Welcome + Setup Email to the new DAF admin
      await this.mailer.sendWelcomeSetupEmail(dto.adminEmail, token, organization.name);

      await this.auditLog.log({
        organizationId: organization.id,
        userId: user.id,
        event: 'organization_created',
        payload: {
          action: 'client_onboarding',
          organizationName: organization.name,
        },
      });

      // Notifier les admins configurés (fire-and-forget)
      this.notifications.notifyNewOrg(organization.name, dto.adminEmail).catch(() => {});

      return {
        message: 'Client organization and root user created successfully.',
        organizationId: organization.id,
        userId: user.id,
      };
    });
  }

  // --- Organizations Management ---

  async findAllOrganizations() {
    return this.prisma.organization.findMany({
      include: {
        _count: {
          select: { 
            users: true, 
            dashboards: true, 
            invitations: {
              where: {
                isAccepted: false,
                expiresAt: { gt: new Date() }
              }
            } 
          },
        },
        owner: {
          select: { email: true, firstName: true, lastName: true },
        },
        subscriptionPlan: {
          select: {
            label: true,
            name: true,
            maxUsers: true,
            maxKpis: true,
            maxWidgets: true,
            hasNlq: true,
            hasAdvancedReports: true,
            priceMonthly: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOrganizationById(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: { 
            users: true, 
            dashboards: true, 
            invitations: {
              where: {
                isAccepted: false,
                expiresAt: { gt: new Date() }
              }
            } 
          },
        },
        owner: {
          select: { email: true, firstName: true, lastName: true },
        },
        subscriptionPlan: {
          select: {
            id: true,
            label: true,
            name: true,
            maxUsers: true,
            maxKpis: true,
            maxWidgets: true,
            hasNlq: true,
            hasAdvancedReports: true,
            priceMonthly: true,
          },
        },
        invitations: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            expiresAt: true,
            isAccepted: true,
            createdAt: true,
            role: {
              select: { name: true },
            },
            invitedBy: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException(`Organisation introuvable : ${id}`);
    }

    return organization;
  }

  async updateOrganization(id: string, dto: AdminUpdateOrganizationDto, adminUserId?: string) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: dto,
    });

    await this.auditLog.log({
      organizationId: id,
      userId: adminUserId,
      event: 'organization_updated',
      payload: { changes: dto },
    });

    return organization;
  }

  async deleteOrganization(id: string, adminUserId?: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    // Audit log AVANT la suppression pour éviter la violation de FK
    if (organization) {
      await this.auditLog.log({
        organizationId: id,
        userId: adminUserId,
        event: 'organization_deleted',
        payload: { organizationName: organization.name },
      });
    }

    // Suppression en cascade dans le bon ordre
    // (seuls Agent/AgentJob/AgentLog/Dashboard n'ont pas onDelete:Cascade dans le schéma)
    return this.prisma.$transaction(async (tx) => {
      // 1. AgentLog + AgentJob → Agent (pas de cascade DB)
      const agents = await tx.agent.findMany({ where: { organizationId: id }, select: { id: true } });
      const agentIds = agents.map((a) => a.id);
      if (agentIds.length > 0) {
        await tx.agentLog.deleteMany({ where: { agentId: { in: agentIds } } });
        await tx.agentJob.deleteMany({ where: { agentId: { in: agentIds } } });
        await tx.agent.deleteMany({ where: { organizationId: id } });
      }

      // 2. Widget → Dashboard (pas de cascade DB sur Dashboard)
      const dashboards = await tx.dashboard.findMany({ where: { organizationId: id }, select: { id: true } });
      const dashboardIds = dashboards.map((d) => d.id);
      if (dashboardIds.length > 0) {
        await tx.widget.deleteMany({ where: { dashboardId: { in: dashboardIds } } });
        await tx.dashboard.deleteMany({ where: { organizationId: id } });
      }

      // 3. Dissocier l'owner pour éviter la contrainte circulaire Organization ↔ User
      await tx.organization.update({ where: { id }, data: { ownerId: null } });

      // 4. Supprimer l'organisation — le reste cascade (User, Invitation, AuditLog,
      //    OnboardingStatus, BillingCustomer, BillingSubscription, BillingInvoice…)
      return tx.organization.delete({ where: { id } });
    });
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

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        userRoles: {
          include: {
            role: {
              select: { id: true, name: true, description: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Utilisateur introuvable : ${id}`);
    }

    return user;
  }

  async updateUser(id: string, dto: AdminUpdateUserDto) {
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

  async deleteUser(id: string, adminUserId?: string) {
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
        userId: adminUserId,
        event: 'user_deleted',
        payload: { deletedUserId: user.id, email: user.email },
      });
    }

    return deleted;
  }

  async createUser(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        organizationId: dto.organizationId,
        userRoles: {
          create: dto.roleIds.map((rId) => ({ roleId: rId })),
        },
      },
      include: {
        organization: { select: { name: true } },
      },
    });

    await this.auditLog.log({
      organizationId: dto.organizationId,
      userId: user.id,
      event: 'user_created',
      payload: {
        email: user.email,
        method: 'direct_creation',
        organizationName: user.organization.name,
      },
    });

    return user;
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

  // --- Subscription Plans Management ---

  async findAllSubscriptionPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { organizations: true } },
      },
    });
  }

  async createSubscriptionPlan(dto: CreateSubscriptionPlanDto) {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Un plan avec le nom "${dto.name}" existe déjà.`);
    }

    return this.prisma.subscriptionPlan.create({ data: dto });
  }

  async updateSubscriptionPlan(id: string, dto: UpdateSubscriptionPlanDto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan d'abonnement introuvable : ${id}`);
    }

    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  async findSubscriptionPlanById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: { select: { organizations: true } },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan d'abonnement introuvable : ${id}`);
    }

    return plan;
  }

  async deactivateSubscriptionPlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan d'abonnement introuvable : ${id}`);
    }

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });
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
    const expiredTokenAgents = agents.filter(
      (a) => !a.isRevoked && a.tokenExpiresAt && a.tokenExpiresAt < now,
    ).length;
    const errorAgents = agents.filter((a) => a.status === 'error').length + expiredTokenAgents;
    const offlineAgents = agents.filter(
      (a) => a.status !== 'online' && a.status !== 'error' && !(a.tokenExpiresAt && a.tokenExpiresAt < now),
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
    const technicalErrorAgents = agents.filter((a) => a.status === 'error').length;
    const agentsDistribution = [
      { name: 'Online', value: activeAgents, color: '#22c55e' },
      { name: 'Hors ligne', value: offlineAgents, color: '#94a3b8' },
      { name: 'Token expiré', value: expiredTokenAgents, color: '#f97316' },
      { name: 'Erreur', value: technicalErrorAgents, color: '#ef4444' },
    ].filter((s) => s.value > 0);

    // --- NEW: Store Inventory ---
    const [kpiCount, packCount, widgetCount, intentCount, nlqTemplateCount] = await Promise.all([
      this.prisma.kpiDefinition.count(),
      this.prisma.kpiPack.count(),
      this.prisma.widgetTemplate.count(),
      this.prisma.nlqIntent.count(),
      this.prisma.nlqTemplate.count(),
    ]);

    // --- NEW: Distributions ---
    const plans = await this.prisma.subscriptionPlan.findMany({
      include: { _count: { select: { organizations: true } } }
    });
    const plansDistribution = plans.map(p => ({
      name: p.label,
      value: p._count.organizations,
    })).filter(p => p.value > 0);

    const organizations = await this.prisma.organization.findMany({
      select: { sector: true }
    });
    const sectorMap = new Map<string, number>();
    organizations.forEach(org => {
      const s = org.sector || 'Non défini';
      sectorMap.set(s, (sectorMap.get(s) || 0) + 1);
    });
    const sectorDistribution = Array.from(sectorMap.entries()).map(([name, value]) => ({
      name,
      value
    }));

    // --- NEW: Onboarding Funnel (orgs bloquées par étape) ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const onboardingRecords = await this.prisma.onboardingStatus.findMany({
      select: { currentStep: true, isComplete: true },
    });
    const onboardingFunnel = [1, 2, 3, 4, 5].map(step => ({
      step: `Étape ${step}`,
      bloquées: onboardingRecords.filter(o => !o.isComplete && o.currentStep === step).length,
      complétées: onboardingRecords.filter(o => o.isComplete || o.currentStep > step).length,
    }));

    // --- NEW: Agent Jobs santé (7 derniers jours) ---
    const [jobsCompleted, jobsFailed, jobsPending] = await Promise.all([
      this.prisma.agentJob.count({ where: { status: 'COMPLETED', createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.agentJob.count({ where: { status: 'FAILED', createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.agentJob.count({ where: { status: 'PENDING', createdAt: { gte: sevenDaysAgo } } }),
    ]);
    const agentJobsStats = [
      { name: 'Complétés', value: jobsCompleted, color: '#22c55e' },
      { name: 'Échoués', value: jobsFailed, color: '#ef4444' },
      { name: 'En attente', value: jobsPending, color: '#f59e0b' },
    ];

    // --- NEW: Recent Audit Logs ---
    const recentAuditLogs = await this.prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } }
      }
    });

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
        expiredTokens: expiredTokenAgents,
      },
      recentActivity,
      agentsDistribution,
      inventory: {
        kpis: kpiCount,
        packs: packCount,
        widgets: widgetCount,
        intents: intentCount,
        nlqTemplates: nlqTemplateCount,
      },
      plansDistribution,
      sectorDistribution,
      onboardingFunnel,
      agentJobsStats,
      recentAuditLogs,
    };
  }

  // ─── KPI Definitions Management ───────────────────────────────────────────

  async findAllKpiDefinitions() {
    return this.prisma.kpiDefinition.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  async findKpiDefinitionById(id: string) {
    const kpi = await this.prisma.kpiDefinition.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException(`KPI Definition introuvable : ${id}`);
    return kpi;
  }

  async createKpiDefinition(dto: CreateKpiDefinitionDto) {
    const existing = await this.prisma.kpiDefinition.findUnique({
      where: { key: dto.key },
    });
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
    return this.prisma.kpiDefinition.update({
      where: { id },
      data: { isActive: !kpi.isActive },
    });
  }

  // ─── Widget Templates Management ──────────────────────────────────────────

  async findAllWidgetTemplates() {
    return this.prisma.widgetTemplate.findMany({
      orderBy: { vizType: 'asc' },
    });
  }

  async findWidgetTemplateById(id: string) {
    const template = await this.prisma.widgetTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Widget Template introuvable : ${id}`);
    return template;
  }

  async createWidgetTemplate(dto: CreateWidgetTemplateDto) {
    const existing = await this.prisma.widgetTemplate.findUnique({
      where: { vizType: dto.vizType },
    });
    if (existing) {
      throw new BadRequestException(`Un Widget Template avec vizType "${dto.vizType}" existe déjà.`);
    }
    return this.prisma.widgetTemplate.create({
      data: {
        ...dto,
        defaultConfig: dto.defaultConfig as Prisma.InputJsonValue,
      },
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
        ...(dto.defaultConfig !== undefined && {
          defaultConfig: dto.defaultConfig as Prisma.InputJsonValue,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async toggleWidgetTemplate(id: string) {
    const template = await this.prisma.widgetTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Widget Template introuvable : ${id}`);
    return this.prisma.widgetTemplate.update({
      where: { id },
      data: { isActive: !template.isActive },
    });
  }

  // ─── KPI Packs Management ─────────────────────────────────────────────────

  async findAllKpiPacks() {
    return this.prisma.kpiPack.findMany({
      orderBy: [{ profile: 'asc' }, { name: 'asc' }],
    });
  }

  async findKpiPackById(id: string) {
    const pack = await this.prisma.kpiPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException(`KPI Pack introuvable : ${id}`);
    return pack;
  }

  async createKpiPack(dto: CreateKpiPackDto) {
    const existing = await this.prisma.kpiPack.findUnique({
      where: { name: dto.name },
    });
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
    return this.prisma.kpiPack.update({
      where: { id },
      data: { isActive: !pack.isActive },
    });
  }

  async findAllInvitations() {
    return this.prisma.invitation.findMany({
      include: {
        organization: {
          select: { id: true, name: true },
        },
        role: {
          select: { id: true, name: true },
        },
        invitedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Dashboards Management (SuperAdmin) ───────────────────────────────────

  async findAllDashboards() {
    return this.prisma.dashboard.findMany({
      include: {
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: {
          select: { widgets: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDashboardById(id: string) {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        widgets: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard introuvable : ${id}`);
    }

    return dashboard;
  }

  async deleteDashboard(id: string, adminUserId?: string) {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id },
      select: { id: true, name: true, organizationId: true },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard introuvable : ${id}`);
    }

    const deleted = await this.prisma.dashboard.delete({
      where: { id },
    });

    await this.auditLog.log({
      organizationId: dashboard.organizationId,
      userId: adminUserId,
      event: 'dashboard_deleted',
      payload: { dashboardId: id, name: dashboard.name, method: 'admin_action' },
    });

    return deleted;
  }

  // ─── Billing — Vue SuperAdmin ─────────────────────────────────────────────

  /**
   * Liste toutes les organisations avec leur abonnement Stripe.
   * Permet au SuperAdmin de surveiller les statuts de paiement (ACTIVE, PAST_DUE, CANCELLED…).
   */
  async findAllBillingSubscriptions() {
    const subscriptions = await (this.prisma as any).billingSubscription.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: {
          select: { id: true, name: true, sector: true },
        },
        plan: {
          select: { id: true, name: true, label: true, priceMonthly: true },
        },
        customer: {
          select: { fwCustomerId: true, email: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { amountPaid: true, currency: true, status: true, paidAt: true },
        },
      },
    });

    // Ajouter les orgs sans abonnement (jamais souscrit)
    const subscribedOrgIds = subscriptions.map((s) => s.organizationId);
    const unsubscribedOrgs = await this.prisma.organization.findMany({
      where: { id: { notIn: subscribedOrgIds } },
      select: {
        id: true,
        name: true,
        sector: true,
        subscriptionPlan: { select: { name: true, label: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      subscriptions,
      unsubscribed: unsubscribedOrgs,
      summary: {
        total: subscriptions.length,
        active: subscriptions.filter((s) => s.status === 'ACTIVE').length,
        trialing: subscriptions.filter((s) => s.status === 'TRIALING').length,
        pastDue: subscriptions.filter((s) => s.status === 'PAST_DUE').length,
        cancelled: subscriptions.filter((s) => s.status === 'CANCELLED').length,
        neverSubscribed: unsubscribedOrgs.length,
      },
    };
  }

  /**
   * Detail complet de l'abonnement d'une organisation : historique des factures inclus.
   */
  async findBillingSubscriptionByOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, sector: true },
    });

    if (!org) {
      throw new NotFoundException(`Organisation introuvable : ${organizationId}`);
    }

    const subscription = await (this.prisma as any).billingSubscription.findUnique({
      where: { organizationId },
      include: {
        plan: true,
        customer: { select: { fwCustomerId: true, email: true } },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fwTransactionId: true,
            amountPaid: true,
            currency: true,
            status: true,
            pdfUrl: true,
            hostedUrl: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      organization: org,
      subscription: subscription ?? null,
      hasSubscription: !!subscription,
    };
  }

  // ─── NLQ Management ───────────────────────────────────────────────────────

  async findAllNlqIntents() {
    return (this.prisma as any).nlqIntent.findMany({
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }

  async findNlqIntentById(id: string) {
    const intent = await (this.prisma as any).nlqIntent.findUnique({
      where: { id },
      include: {
        templates: true,
      },
    });
    if (!intent) throw new NotFoundException(`NLQ Intent introuvable : ${id}`);
    return intent;
  }

  async findAllNlqTemplates() {
    return (this.prisma as any).nlqTemplate.findMany({
      orderBy: { intent: { label: 'asc' } },
      include: {
        intent: {
          select: { label: true },
        },
      },
    });
  }

  async findNlqTemplateById(id: string) {
    const template = await (this.prisma as any).nlqTemplate.findUnique({
      where: { id },
      include: {
        intent: true,
      },
    });
    return template;
  }

  async toggleNlqTemplate(id: string) {
    const template = await (this.prisma as any).nlqTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`NLQ Template introuvable : ${id}`);
    return (this.prisma as any).nlqTemplate.update({
      where: { id },
      data: { isActive: !template.isActive },
    });
  }

  async findAllNlqSessions() {
    return this.prisma.nlqSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        intent: { select: { key: true, label: true } },
      },
    });
  }

  async findNlqSessionById(id: string) {
    const session = await this.prisma.nlqSession.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, sector: true, country: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        intent: {
          include: {
            templates: { select: { id: true, sageType: true, defaultVizType: true, isActive: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException(`Session NLQ introuvable : ${id}`);
    return session;
  }

  async deleteAgent(id: string, adminUserId?: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, organizationId: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent introuvable : ${id}`);
    }

    // On supprime d'abord les jobs associés car le onDelete: Cascade n'est pas présent dans le schema pour AgentJob
    await this.prisma.agentJob.deleteMany({
      where: { agentId: id },
    });

    const deleted = await this.prisma.agent.delete({
      where: { id },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      userId: adminUserId,
      event: 'agent_deleted',
      payload: { agentId: id, name: agent.name, method: 'admin_action' },
    });

    return deleted;
  }

  // ─── Onboarding Overview ──────────────────────────────────────────────────────

  async getOnboardingOverview() {
    const orgs = await this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        sector: true,
        country: true,
        createdAt: true,
        subscriptionPlan: { select: { name: true, label: true } },
        owner: { select: { email: true, firstName: true, lastName: true } },
        onboardingStatus: {
          select: {
            currentStep: true,
            completedSteps: true,
            isComplete: true,
            inviteLater: true,
            updatedAt: true,
          },
        },
        agents: {
          where: { isRevoked: false },
          select: { id: true, name: true, status: true, lastSeen: true, tokenExpiresAt: true },
          orderBy: { lastSeen: 'desc' },
          take: 1,
        },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = orgs.map((org) => {
      const status = org.onboardingStatus;
      const agent = org.agents[0] ?? null;

      // Durée depuis dernière activité onboarding
      const daysSinceUpdate = status
        ? Math.floor((Date.now() - new Date(status.updatedAt).getTime()) / 86_400_000)
        : null;

      // Étape bloquante = étape courante non complétée depuis > 3 jours
      const isStuck = status && !status.isComplete && daysSinceUpdate !== null && daysSinceUpdate > 3;

      return {
        organizationId: org.id,
        organizationName: org.name,
        sector: org.sector,
        country: org.country,
        plan: org.subscriptionPlan ?? null,
        owner: org.owner ?? null,
        userCount: org._count.users,
        createdAt: org.createdAt,
        onboarding: status
          ? {
              currentStep: status.currentStep,
              completedSteps: status.completedSteps,
              isComplete: status.isComplete,
              inviteLater: status.inviteLater,
              updatedAt: status.updatedAt,
              daysSinceUpdate,
              isStuck,
            }
          : null,
        agent: agent
          ? {
              id: agent.id,
              name: agent.name,
              status: agent.status,
              lastSeen: agent.lastSeen,
              tokenExpiresAt: agent.tokenExpiresAt,
            }
          : null,
      };
    });

    const summary = {
      total: rows.length,
      completed: rows.filter((r) => r.onboarding?.isComplete).length,
      inProgress: rows.filter((r) => r.onboarding && !r.onboarding.isComplete).length,
      notStarted: rows.filter((r) => !r.onboarding).length,
      stuck: rows.filter((r) => r.onboarding?.isStuck).length,
      withAgentOnline: rows.filter((r) => r.agent?.status === 'online').length,
    };

    return { summary, organizations: rows };
  }

  // ── System config (singleton) ────────────────────────────────────────────────

  async getSystemConfig() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 'default' },
    });
    return config ?? { id: 'default', notificationPreferences: null };
  }

  async updateSystemConfig(data: { notificationPreferences?: Record<string, unknown> }) {
    return this.prisma.systemConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        notificationPreferences: data.notificationPreferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
      update: {
        notificationPreferences: data.notificationPreferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
    });
  }
}
