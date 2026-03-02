import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AgentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Generate a unique agent token
   */
  private generateToken(): string {
    // Format: isag_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 chars random)
    const randomPart = randomBytes(24).toString('hex');
    return `isag_${randomPart}`;
  }

  /**
   * Generate a new agent with token for an organization
   */
  async generateAgentToken(organizationId: string, dto: GenerateTokenDto) {
    // Check if organization already has an agent
    const existingAgent = await this.prisma.agent.findFirst({
      where: { organizationId },
    });

    if (existingAgent && !dto.force) {
      throw new BadRequestException(
        'Organization already has an agent. Use force=true to create another.',
      );
    }

    const token = this.generateToken();

    const agent = await this.prisma.agent.create({
      data: {
        token,
        name: dto.name || `Agent-${organizationId.slice(0, 8)}`,
        status: 'pending',
        organizationId,
      },
    });

    await this.auditLog.log({
      organizationId,
      event: 'agent_token_generated',
      payload: { agentId: agent.id, agentName: agent.name },
    });

    return {
      id: agent.id,
      token: agent.token,
      name: agent.name,
      status: agent.status,
      message: 'Token generated. Use this token in the agent configuration.',
      instructions: {
        step1: 'Copy the token above',
        step2: 'Paste it in agent/config/config.yaml under backend.agent_token',
        step3: 'Start the agent: python -m src.main',
      },
    };
  }

  /**
   * Register an agent (called by on-premise agent)
   */
  async registerAgent(dto: RegisterAgentDto, ipAddress?: string) {
    // Find agent by token
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.agent_token },
      include: { organization: true },
    });

    if (!agent) {
      throw new NotFoundException('Invalid agent token');
    }

    // Update agent info
    const updatedAgent = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: 'online',
        version: dto.agent_version || '1.0.0',
        name: dto.agent_name || agent.name,
        lastSeen: new Date(),
        errorCount: 0,
        lastError: null,
      },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      event: 'agent_registered',
      payload: {
        agentId: agent.id,
        sageType: dto.sage_type,
        sageVersion: dto.sage_version,
        ipAddress,
      },
      ipAddress,
    });

    return {
      success: true,
      agent_id: updatedAgent.id,
      organization_id: agent.organizationId,
      organization_name: agent.organization.name,
      message: 'Agent registered successfully',
    };
  }

  /**
   * Process heartbeat from agent
   */
  async processHeartbeat(dto: HeartbeatDto) {
    // Find agent by token
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.agentToken },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Determine status
    let newStatus = dto.status || 'online';
    let errorCount = agent.errorCount;
    let lastError = agent.lastError;

    if (dto.errorCount && dto.errorCount > 0) {
      errorCount = dto.errorCount;
      newStatus = dto.errorCount > 5 ? 'error' : 'online';
    }

    if (dto.lastError) {
      lastError = dto.lastError;
    }

    // Update agent
    const updatedAgent = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: newStatus,
        lastSeen: new Date(),
        version: dto.agentVersion || agent.version,
        errorCount,
        lastError,
      },
    });

    // Log if status changed to error
    if (newStatus === 'error' && agent.status !== 'error') {
      await this.auditLog.log({
        organizationId: agent.organizationId,
        event: 'agent_error',
        payload: {
          agentId: agent.id,
          errorCount,
          lastError,
        },
      });
    }

    return {
      success: true,
      status: updatedAgent.status,
      serverTime: new Date().toISOString(),
      nextHeartbeat: 30, // seconds
    };
  }

  /**
   * Get agent status for an organization
   */
  async getAgentStatusByOrg(organizationId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date().getTime();

    return agents.map((agent) => {
      // Calculate if agent is stale (no heartbeat in 2 minutes)
      const isStale = agent.lastSeen
        ? now - agent.lastSeen.getTime() > 2 * 60 * 1000
        : true;

      return {
        id: agent.id,
        name: agent.name,
        status: isStale && agent.status === 'online' ? 'offline' : agent.status,
        version: agent.version,
        lastSeen: agent.lastSeen,
        lastSync: agent.lastSync,
        rowsSynced: Number(agent.rowsSynced),
        errorCount: agent.errorCount,
        lastError: agent.lastError,
        isStale,
      };
    });
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Don't expose the full token
    return {
      ...agent,
      token: agent.token.slice(0, 10) + '...',
      tokenPreview: agent.token.slice(0, 15),
    };
  }

  /**
   * Regenerate agent token
   */
  async regenerateToken(agentId: string, organizationId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    const newToken = this.generateToken();

    const updatedAgent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        token: newToken,
        status: 'pending', // Agent needs to re-register
        lastSeen: null,
      },
    });

    await this.auditLog.log({
      organizationId,
      event: 'agent_token_regenerated',
      payload: { agentId, agentName: agent.name },
    });

    return {
      id: updatedAgent.id,
      token: newToken,
      message: 'Token regenerated. Update agent configuration with new token.',
    };
  }

  /**
   * Mark agent as offline (called by cron job)
   */
  async markStaleAgentsOffline() {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const result = await this.prisma.agent.updateMany({
      where: {
        status: 'online',
        lastSeen: {
          lt: twoMinutesAgo,
        },
      },
      data: {
        status: 'offline',
      },
    });

    return { markedOffline: result.count };
  }
}
