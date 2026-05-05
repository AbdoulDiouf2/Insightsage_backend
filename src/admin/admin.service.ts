import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, JobStatus } from '@prisma/client';
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
import { AiRouterService } from '../ai/ai-router.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private mailer: MailerService,
    private notifications: NotificationsService,
    private aiRouter: AiRouterService,
    private config: ConfigService,
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
    const { plan, ...rest } = dto;

    const organization = await this.prisma.organization.update({
      where: { id },
      data: {
        ...rest,
        ...(plan ? { subscriptionPlan: { connect: { id: plan } } } : {}),
      },
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
    const users = await this.prisma.user.findMany({
      include: {
        organization: { select: { name: true } },
        userRoles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(({ hashedRefreshToken, resetPasswordToken, resetPasswordExpires, passwordHash, ...u }) => ({
      ...u,
      setupStatus: hashedRefreshToken !== null
        ? 'active'
        : (resetPasswordExpires && resetPasswordExpires > new Date() ? 'pending' : 'expired'),
      setupTokenExpiresAt: (!hashedRefreshToken && resetPasswordExpires) ? resetPasswordExpires : null,
    }));
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

    const rawPassword = dto.password ?? crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // Génère un token de setup pour que l'utilisateur définisse son propre mot de passe
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');
    const setupTokenExpires = new Date(Date.now() + 7 * 24 * 3600000); // 7 jours

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        organizationId: dto.organizationId,
        resetPasswordToken: setupTokenHash,
        resetPasswordExpires: setupTokenExpires,
        userRoles: {
          create: dto.roleIds.map((rId) => ({ roleId: rId })),
        },
      },
      include: {
        organization: { select: { name: true } },
      },
    });

    const assignedRoles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds } },
      select: { name: true },
    });
    const isSuperAdmin = assignedRoles.some((r) => r.name === 'superadmin');

    await this.mailer.sendWelcomeSetupEmail(
      user.email,
      setupToken,
      user.organization.name,
      isSuperAdmin ? 'admin' : 'client',
    );

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

  async resendSetupEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { name: true } } },
    });

    if (!user) throw new NotFoundException(`Utilisateur introuvable : ${userId}`);
    if (user.hashedRefreshToken !== null) throw new BadRequestException('Compte déjà activé — connexion déjà effectuée.');

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600000); // 24h

    await this.prisma.user.update({
      where: { id: userId },
      data: { resetPasswordToken: tokenHash, resetPasswordExpires: expiresAt },
    });

    const isSuperAdmin = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: 'superadmin' } },
    });

    await this.mailer.sendWelcomeSetupEmail(
      user.email,
      token,
      user.organization.name,
      isSuperAdmin ? 'admin' : 'client',
    );

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId,
      event: 'password_reset_requested',
      payload: { method: 'resend_setup', triggeredBy: 'superadmin' },
    });

    return { message: 'Email de setup renvoyé.', expiresAt };
  }

  // --- Audit Logs ---

  async findAllAuditLogs(params?: {
    userId?: string;
    event?: string;
    events?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params?.limit ?? 100, 500);
    const offset = params?.offset ?? 0;

    const where: any = {};
    if (params?.userId)    where.userId    = params.userId;
    if (params?.event)     where.event     = { contains: params.event, mode: 'insensitive' };
    if (params?.events)    where.event     = { in: params.events.split(',') };
    if (params?.startDate) where.createdAt = { ...(where.createdAt ?? {}), gte: new Date(params.startDate) };
    if (params?.endDate)   where.createdAt = { ...(where.createdAt ?? {}), lte: new Date(params.endDate) };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, limit, offset, hasMore: offset + logs.length < total },
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

  async listAllAgents() {
    return this.prisma.agent.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAgent(id: string, adminUserId?: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, organizationId: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent introuvable : ${id}`);
    }

    // Suppression des tables liées sans onDelete: Cascade
    await this.prisma.agentSyncBatch.deleteMany({ where: { agentId: id } });
    await this.prisma.agentViewSnapshot.deleteMany({ where: { agentId: id } });
    await this.prisma.agentJob.deleteMany({ where: { agentId: id } });

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

  // ── KPI Health Stats ─────────────────────────────────────────────────────────

  async getKpiHealthStats() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const kpis = await this.prisma.kpiDefinition.findMany({
      orderBy: { category: 'asc' },
    });

    const sessions = await this.prisma.nlqSession.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        intentKey: { not: null },
      },
      select: {
        intentKey: true,
        organizationId: true,
        jobId: true,
      },
    });

    const jobIds = sessions.map((s) => s.jobId).filter(Boolean) as string[];
    const jobs = await this.prisma.agentJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true, errorMessage: true },
    });
    const jobsById = new Map(jobs.map((j) => [j.id, j]));

    return kpis.map((kpi) => {
      const kpiSessions = sessions.filter((s) => s.intentKey === kpi.key && s.jobId);
      const kpiJobs = kpiSessions
        .map((s) => ({ session: s, job: jobsById.get(s.jobId!) }))
        .filter((x) => x.job !== undefined);

      const total = kpiJobs.length;
      const completed = kpiJobs.filter((x) => x.job!.status === 'COMPLETED').length;
      const failed = kpiJobs.filter((x) => x.job!.status === 'FAILED');

      const successRate = total > 0 ? Math.round((completed / total) * 100) : null;
      const activeOrganizations = new Set(
        kpiJobs
          .filter((x) => x.job!.status === 'COMPLETED')
          .map((x) => x.session.organizationId),
      ).size;

      const lastError =
        failed.length > 0 ? (failed[failed.length - 1].job!.errorMessage ?? null) : null;

      let status: 'Healthy' | 'Warning' | 'Error' | 'Unknown';
      if (successRate === null) {
        status = 'Unknown';
      } else if (successRate >= 80) {
        status = 'Healthy';
      } else if (successRate >= 50) {
        status = 'Warning';
      } else {
        status = 'Error';
      }

      return {
        id: kpi.id,
        key: kpi.key,
        name: kpi.name,
        category: kpi.category,
        successRate,
        activeOrganizations,
        lastError,
        status,
        totalJobs: total,
      };
    });
  }

  async getKpiHealthDetail(kpiId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const kpi = await this.prisma.kpiDefinition.findUnique({ where: { id: kpiId } });
    if (!kpi) throw new NotFoundException('KPI not found');

    const sessions = await this.prisma.nlqSession.findMany({
      where: { intentKey: kpi.key, createdAt: { gte: sevenDaysAgo } },
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobIds = sessions.map((s) => s.jobId).filter(Boolean) as string[];
    const jobs = await this.prisma.agentJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true, errorMessage: true, startedAt: true, completedAt: true },
    });
    const jobsById = new Map(jobs.map((j) => [j.id, j]));

    const enriched = sessions.map((s) => {
      const job = s.jobId ? jobsById.get(s.jobId) : null;
      return {
        id: s.id,
        createdAt: s.createdAt,
        organization: s.organization,
        user: s.user,
        jobStatus: job ? job.status : 'NO_JOB',
        errorMessage: job ? (job.errorMessage ?? null) : (s.errorMessage ?? null),
        latencyMs: s.latencyMs,
        completedAt: job?.completedAt ?? null,
      };
    });

    // Only count sessions that actually have a resolved job (mirrors getKpiHealthStats logic)
    const withJob = enriched.filter((s) => s.jobStatus !== 'NO_JOB');
    const total = withJob.length;
    const completed = withJob.filter((s) => s.jobStatus === 'COMPLETED').length;
    const failed = enriched.filter((s) => s.jobStatus === 'FAILED');
    const successRate = total > 0 ? Math.round((completed / total) * 100) : null;
    const activeOrganizations = new Set(
      enriched.filter((s) => s.jobStatus === 'COMPLETED').map((s) => s.organization?.id),
    ).size;
    const lastError = failed.length > 0 ? (failed[0].errorMessage ?? null) : null;

    let status: 'Healthy' | 'Warning' | 'Error' | 'Unknown';
    if (successRate === null) status = 'Unknown';
    else if (successRate >= 80) status = 'Healthy';
    else if (successRate >= 50) status = 'Warning';
    else status = 'Error';

    return {
      kpi,
      health: { successRate, activeOrganizations, lastError, status, totalJobs: total, completedJobs: completed },
      sessions: enriched,
    };
  }

  // ── System config (singleton) ────────────────────────────────────────────────

  async getSystemConfig() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 'default' },
    });
    return config ?? { id: 'default', notificationPreferences: null, featureFlags: null };
  }

  async getLocalLlmModels(url: string): Promise<{ models: string[] }> {
    const models = await this.aiRouter.listLocalModels(url);
    return { models };
  }

  async updateSystemConfig(data: {
    notificationPreferences?: Record<string, unknown>;
    featureFlags?: Record<string, unknown>;
  }) {
    return this.prisma.systemConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        notificationPreferences: data.notificationPreferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
        featureFlags: data.featureFlags as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
      update: {
        ...(data.notificationPreferences !== undefined && {
          notificationPreferences: data.notificationPreferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
        }),
        ...(data.featureFlags !== undefined && {
          featureFlags: data.featureFlags as Prisma.InputJsonValue ?? Prisma.JsonNull,
        }),
      },
    });
  }

  // ── Admin — Agents (cross-org, pas de filtre organizationId) ─────────────────

  async getAdminAgentById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!agent) throw new NotFoundException(`Agent introuvable : ${id}`);
    return {
      ...agent,
      tokenPreview: agent.token ? agent.token.slice(0, 15) + '...' : null,
      token: undefined, // ne jamais exposer le token complet
    };
  }

  async getAdminAgentLogs(agentId: string, page = 1, limit = 50, search?: string) {
    const where: any = { agentId };
    if (search) where.message = { contains: search, mode: 'insensitive' };

    const [logs, total] = await Promise.all([
      this.prisma.agentLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentLog.count({ where }),
    ]);

    return { logs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getAdminAgentJobs(agentId: string, page = 1, limit = 20, status?: JobStatus, search?: string) {
    const where: any = { agentId };
    if (status) where.status = status;
    if (search) where.sql = { contains: search, mode: 'insensitive' };

    const [jobs, total] = await Promise.all([
      this.prisma.agentJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.agentJob.count({ where }),
    ]);

    return { jobs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getAdminAgentJobStats(agentId: string) {
    const rows = await this.prisma.agentJob.groupBy({
      by: ['status'],
      where: { agentId },
      _count: { status: true },
    });

    const stats: Record<string, number> = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
    for (const row of rows) stats[row.status] = row._count.status;
    return { ...stats, total: Object.values(stats).reduce((a, b) => a + b, 0) };
  }

  async revokeAdminAgentToken(id: string, adminUserId?: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent introuvable');
    if (agent.isRevoked) throw new BadRequestException('Ce token est déjà révoqué');

    const updated = await this.prisma.agent.update({
      where: { id },
      data: { isRevoked: true, revokedAt: new Date(), status: 'pending' },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      userId: adminUserId,
      event: 'agent_token_revoked',
      payload: { agentId: id, agentName: agent.name, by: 'superadmin' },
    });

    return { id: updated.id, name: updated.name, isRevoked: true, revokedAt: updated.revokedAt };
  }

  async regenerateAdminAgentToken(id: string, adminUserId?: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent introuvable');

    const TOKEN_TTL_DAYS = 30;
    const newToken = `isag_${crypto.randomBytes(24).toString('hex')}`;
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);

    const updated = await this.prisma.agent.update({
      where: { id },
      data: { token: newToken, status: 'pending', lastSeen: null, tokenExpiresAt, isRevoked: false, revokedAt: null },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      userId: adminUserId,
      event: 'agent_token_generated',
      payload: { agentId: id, agentName: agent.name, by: 'superadmin' },
    });

    return { id: updated.id, token: newToken, tokenExpiresAt, daysUntilExpiry: TOKEN_TTL_DAYS };
  }

  async generateAgentTokenForOrg(organizationId: string, name: string | undefined, adminUserId?: string) {
    const TOKEN_TTL_DAYS = 30;
    const token = `isag_${crypto.randomBytes(24).toString('hex')}`;
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);

    const [existing, org] = await Promise.all([
      this.prisma.agent.findFirst({ where: { organizationId } }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);

    let agent;
    if (existing) {
      agent = await this.prisma.agent.update({
        where: { id: existing.id },
        data: { token, tokenExpiresAt, status: 'pending', isRevoked: false, revokedAt: null, machineId: null },
      });
    } else {
      agent = await this.prisma.agent.create({
        data: {
          token,
          tokenExpiresAt,
          name: name || `Agent Sage — ${org?.name ?? organizationId.slice(0, 8)}`,
          status: 'pending',
          organizationId,
        },
      });
    }

    await this.auditLog.log({
      organizationId,
      userId: adminUserId,
      event: 'agent_token_generated',
      payload: { agentId: agent.id, agentName: agent.name, by: 'superadmin' },
    });

    return { id: agent.id, token, name: agent.name, status: agent.status, tokenExpiresAt, daysUntilExpiry: TOKEN_TTL_DAYS };
  }

  // ── Admin — Audit log par ID ──────────────────────────────────────────────────

  async getAuditLogById(id: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    });
    if (!log) throw new NotFoundException(`Audit log introuvable : ${id}`);
    return log;
  }

  // ── Admin — Roles (cross-org) ─────────────────────────────────────────────────

  async listAllRoles() {
    return this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { include: { permission: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  async getAdminRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!role) throw new NotFoundException(`Rôle introuvable : ${id}`);
    return role;
  }

  async createRoleForOrg(organizationId: string, dto: { name: string; description?: string; permissionIds: string[] }, adminUserId?: string) {
    const existing = await this.prisma.role.findFirst({ where: { name: dto.name, organizationId } });
    if (existing) throw new BadRequestException(`Un rôle nommé "${dto.name}" existe déjà pour cette organisation`);

    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        isSystem: false,
        organizationId,
        permissions: {
          create: (dto.permissionIds || []).map(permissionId => ({ permissionId })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updateAdminRole(id: string, dto: { name?: string; description?: string; permissionIds?: string[] }, adminUserId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Rôle introuvable : ${id}`);
    // Les rôles système peuvent avoir leurs permissions mises à jour par un SuperAdmin,
    // mais leur nom et description sont figés (référencés dans le code).
    if (role.isSystem && (dto.name || dto.description !== undefined)) {
      throw new BadRequestException('Le nom et la description des rôles système ne peuvent pas être modifiés');
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissionIds && {
          permissions: {
            deleteMany: {},
            create: dto.permissionIds.map(permissionId => ({ permissionId })),
          },
        }),
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async deleteAdminRole(id: string, adminUserId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Rôle introuvable : ${id}`);
    if (role.isSystem) throw new BadRequestException('Les rôles système ne peuvent pas être supprimés');

    return this.prisma.role.delete({ where: { id } });
  }

  // ── Storage Migration ─────────────────────────────────────────────────────────

  async getStorageMigrationStatus() {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? 'uploads';
    const localPrefix = `${appUrl}/${uploadDir}/`;
    const minioPublicUrl = this.config.get<string>('R2_PUBLIC_URL') ?? '';

    const [allReleases, allBugs] = await Promise.all([
      this.prisma.agentRelease.findMany({ select: { id: true, fileUrl: true } }),
      this.prisma.bug.findMany({ select: { id: true, attachments: true } }),
    ]);

    const releasesWithLocalUrls = allReleases.filter(r => r.fileUrl?.startsWith(localPrefix)).length;
    const bugsWithLocalUrls = allBugs.filter(bug =>
      Array.isArray(bug.attachments) && bug.attachments.some((url: string) => url.startsWith(localPrefix))
    ).length;

    return {
      bugsWithLocalUrls,
      releasesWithLocalUrls,
      total: bugsWithLocalUrls + releasesWithLocalUrls,
      localPrefix,
      minioPublicUrl,
    };
  }

  async migrateLocalToMinio() {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? 'uploads';
    const localPrefix = `${appUrl}/${uploadDir}/`;
    const minioPublicUrl = this.config.get<string>('R2_PUBLIC_URL') ?? '';

    if (!minioPublicUrl) {
      throw new BadRequestException('R2_PUBLIC_URL non configuré — MinIO indisponible');
    }

    const releases = await this.prisma.agentRelease.findMany({
      where: { fileUrl: { startsWith: localPrefix } },
    });
    let migratedReleases = 0;
    for (const release of releases) {
      await this.prisma.agentRelease.update({
        where: { id: release.id },
        data: { fileUrl: release.fileUrl.replace(localPrefix, `${minioPublicUrl}/`) },
      });
      migratedReleases++;
    }

    const bugs = await this.prisma.bug.findMany({ select: { id: true, attachments: true } });
    let migratedBugs = 0;
    for (const bug of bugs) {
      if (!Array.isArray(bug.attachments)) continue;
      const hasLocal = bug.attachments.some((url: string) => url.startsWith(localPrefix));
      if (!hasLocal) continue;
      const newAttachments = bug.attachments.map((url: string) =>
        url.startsWith(localPrefix) ? url.replace(localPrefix, `${minioPublicUrl}/`) : url
      );
      await this.prisma.bug.update({ where: { id: bug.id }, data: { attachments: newAttachments } });
      migratedBugs++;
    }

    return { migratedBugs, migratedReleases, total: migratedBugs + migratedReleases };
  }

  async updateStoragePublicUrl(oldPrefix: string, newPrefix: string) {
    const releases = await this.prisma.agentRelease.findMany({
      where: { fileUrl: { startsWith: oldPrefix } },
    });
    let migratedReleases = 0;
    for (const release of releases) {
      await this.prisma.agentRelease.update({
        where: { id: release.id },
        data: { fileUrl: release.fileUrl.replace(oldPrefix, newPrefix) },
      });
      migratedReleases++;
    }

    const bugs = await this.prisma.bug.findMany({ select: { id: true, attachments: true } });
    let migratedBugs = 0;
    for (const bug of bugs) {
      if (!Array.isArray(bug.attachments)) continue;
      const hasOld = bug.attachments.some((url: string) => url.startsWith(oldPrefix));
      if (!hasOld) continue;
      const newAttachments = bug.attachments.map((url: string) =>
        url.startsWith(oldPrefix) ? url.replace(oldPrefix, newPrefix) : url,
      );
      await this.prisma.bug.update({ where: { id: bug.id }, data: { attachments: newAttachments } });
      migratedBugs++;
    }

    return { migratedBugs, migratedReleases, total: migratedBugs + migratedReleases };
  }
}
