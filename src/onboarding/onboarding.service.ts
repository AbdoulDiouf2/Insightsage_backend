import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { AgentsService } from '../agents/agents.service';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { AgentLinkDto } from './dto/agent-link.dto';
import { Step4Dto } from './dto/step4.dto';
import { Step5Dto } from './dto/step5.dto';
import { TestConnectionDto } from './dto/test-connection.dto';

// Profils metiers disponibles (enrichissable sans redeploiement)
const AVAILABLE_PROFILES = [
  { name: 'daf', label: 'DAF / CFO', description: 'Directeur Administratif et Financier' },
  { name: 'dg', label: 'DG', description: 'Directeur General' },
  { name: 'controller', label: 'Controleur de gestion', description: 'Financial Controller' },
  { name: 'manager', label: 'Manager', description: 'Responsable de departement' },
  { name: 'analyst', label: 'Analyste', description: 'Analyste financier (lecture seule)' },
];

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private authService: AuthService,
    private agentsService: AgentsService,
  ) {}

  // Cree le statut d onboarding si inexistant pour l organisation
  async getOrCreateStatus(organizationId: string) {
    const existing = await this.prisma.onboardingStatus.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return this.prisma.onboardingStatus.create({ data: { organizationId } });
  }

  // Marque une etape comme completee et avance currentStep
  private async completeStep(organizationId: string, step: number) {
    const status = await this.getOrCreateStatus(organizationId);

    const completedSteps = status.completedSteps.includes(step)
      ? status.completedSteps
      : [...status.completedSteps, step].sort((a, b) => a - b);

    const nextStep = Math.max(status.currentStep, step + 1);
    const isComplete = completedSteps.length >= 5;

    const updated = await this.prisma.onboardingStatus.update({
      where: { organizationId },
      data: { completedSteps, currentStep: nextStep, isComplete },
    });

    await this.auditLog.log({
      organizationId,
      event: 'onboarding_step_completed',
      payload: { step, completedSteps, isComplete },
    });

    if (isComplete) {
      await this.auditLog.log({
        organizationId,
        event: 'onboarding_completed',
        payload: { completedAt: new Date().toISOString() },
      });
    }

    return updated;
  }

  // GET /onboarding/status
  async getStatus(organizationId: string) {
    const status = await this.getOrCreateStatus(organizationId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        sector: true,
        size: true,
        country: true,
        sageType: true,
        sageMode: true,
        selectedProfiles: true,
        subscriptionPlan: { select: { id: true, name: true, label: true } },
      },
    });
    return { status, organization: org };
  }

  // POST /onboarding/step1 : Choix du plan
  async step1(organizationId: string, dto: Step1Dto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: dto.plan },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Plan introuvable ou inactif.');
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { planId: plan.id },
    });
    await this.auditLog.log({
      organizationId,
      event: 'subscription_plan_selected',
      payload: { planName: plan.name, planLabel: plan.label },
    });
    const status = await this.completeStep(organizationId, 1);
    return {
      message: 'Plan selectionne avec succes.',
      plan: { id: plan.id, name: plan.name, label: plan.label },
      status,
    };
  }

  // POST /onboarding/step2 : Profil organisation
  async step2(organizationId: string, dto: Step2Dto) {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.sector && { sector: dto.sector }),
        ...(dto.size && { size: dto.size }),
        ...(dto.country && { country: dto.country }),
      },
      select: { id: true, name: true, sector: true, size: true, country: true },
    });
    const status = await this.completeStep(organizationId, 2);
    return { message: 'Profil organisation mis a jour.', organization: updated, status };
  }

  // POST /onboarding/step3 : Configuration data source Sage
  async step3(organizationId: string, dto: Step3Dto) {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        sageType: dto.sageType,
        sageMode: dto.sageMode,
        ...(dto.sageHost !== undefined && { sageHost: dto.sageHost }),
        ...(dto.sagePort !== undefined && { sagePort: dto.sagePort }),
      },
      select: { id: true, sageType: true, sageMode: true, sageHost: true, sagePort: true },
    });
    await this.auditLog.log({
      organizationId,
      event: 'datasource_configured',
      payload: { sageType: dto.sageType, sageMode: dto.sageMode },
    });
    const status = await this.completeStep(organizationId, 3);
    return { message: 'Configuration Sage enregistree.', datasource: updated, status };
  }

  // POST /onboarding/agent-link : Lier un agent
  async linkAgent(organizationId: string, dto: AgentLinkDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.agentToken },
      select: {
        id: true,
        name: true,
        organizationId: true,
        status: true,
        isRevoked: true,
        tokenExpiresAt: true,
      },
    });

    if (!agent) throw new NotFoundException('Aucun agent trouve avec ce token.');
    if (agent.organizationId !== organizationId) {
      throw new BadRequestException('Ce token agent appartient a une autre organisation.');
    }
    if (agent.isRevoked) {
      throw new BadRequestException('Ce token agent a ete revoque. Generez un nouveau token.');
    }
    if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
      throw new BadRequestException('Ce token agent a expire. Regenerez le token.');
    }

    await this.auditLog.log({
      organizationId,
      event: 'agent_linked',
      payload: { agentId: agent.id, agentName: agent.name },
    });

    return {
      message: 'Agent lie avec succes a l organisation.',
      agent: { id: agent.id, name: agent.name, status: agent.status },
    };
  }

  // GET /onboarding/profiles : Profils metiers disponibles
  getAvailableProfiles() {
    return AVAILABLE_PROFILES;
  }

  // POST /onboarding/step4 : Selection des profils metiers
  async step4(organizationId: string, dto: Step4Dto) {
    const validNames = AVAILABLE_PROFILES.map((p) => p.name);
    const invalid = dto.profiles.filter((p) => !validNames.includes(p));
    if (invalid.length > 0) {
      throw new BadRequestException(
        'Profils inconnus: ' + invalid.join(', ') + '. Valeurs acceptees: ' + validNames.join(', '),
      );
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { selectedProfiles: dto.profiles },
    });
    const status = await this.completeStep(organizationId, 4);
    return { message: 'Profils metiers selectionnes.', selectedProfiles: dto.profiles, status };
  }

  // POST /onboarding/step5 : Invitations utilisateurs
  async step5(organizationId: string, userId: string, dto: Step5Dto) {
    if (dto.inviteLater) {
      await this.prisma.onboardingStatus.update({
        where: { organizationId },
        data: { inviteLater: true },
      });
      const status = await this.completeStep(organizationId, 5);
      return { message: 'Invitations reportees. Vous pourrez inviter plus tard.', status };
    }

    if (!dto.invitations || dto.invitations.length === 0) {
      throw new BadRequestException(
        'Fournissez au moins une invitation ou passez inviteLater a true.',
      );
    }

    const results: { email: string; status: string; error?: string }[] = [];
    for (const inv of dto.invitations) {
      try {
        await this.authService.inviteUser({
          email: inv.email,
          role: inv.role,
          organizationId,
        });
        results.push({ email: inv.email, status: 'invited' });
      } catch (error) {
        results.push({
          email: inv.email,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'users_invited_bulk',
      payload: {
        total: dto.invitations.length,
        succeeded: results.filter((r) => r.status === 'invited').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
    });

    const status = await this.completeStep(organizationId, 5);
    return { message: 'Invitations traitees.', results, status };
  }

  // POST /datasource/test-connection
  async testConnection(organizationId: string, dto: TestConnectionDto) {
    let agent: {
      id: string;
      name: string;
      status: string;
      lastSeen: Date | null;
      isRevoked?: boolean;
      organizationId?: string;
    } | null = null;

    if (dto.agentToken) {
      agent = await this.prisma.agent.findUnique({
        where: { token: dto.agentToken },
        select: {
          id: true,
          name: true,
          status: true,
          organizationId: true,
          lastSeen: true,
          isRevoked: true,
        },
      });
      if (!agent || (agent as any).organizationId !== organizationId) {
        throw new NotFoundException('Agent introuvable pour ce token.');
      }
    } else {
      agent = await this.prisma.agent.findFirst({
        where: { organizationId, status: 'online', isRevoked: false },
        select: { id: true, name: true, status: true, lastSeen: true },
        orderBy: { lastSeen: 'desc' },
      });
    }

    if (!agent) {
      return {
        status: 'ERROR',
        agentOnline: false,
        message: "Aucun agent actif trouve. Assurez-vous que l agent est demarre et connecte.",
      };
    }

    if (agent.status !== 'online') {
      return {
        status: 'WARNING',
        agentOnline: false,
        agentId: agent.id,
        agentName: agent.name,
        lastSeen: agent.lastSeen,
        message: 'L agent est actuellement ' + agent.status + '. Verifiez qu il est bien demarre.',
      };
    }

    const secondsSinceHeartbeat = agent.lastSeen
      ? Math.floor((Date.now() - agent.lastSeen.getTime()) / 1000)
      : null;

    return {
      status: 'OK',
      agentOnline: true,
      agentId: agent.id,
      agentName: agent.name,
      lastSeen: agent.lastSeen,
      secondsSinceHeartbeat,
      message: 'Connexion agent etablie. Votre instance Sage est accessible.',
    };
  }
}
