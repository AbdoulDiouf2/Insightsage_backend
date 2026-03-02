import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Public, RequirePermissions, OrganizationId } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // ============================================================
  // PUBLIC ENDPOINTS (Called by Agent On-Premise)
  // ============================================================

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register an agent with the backend',
    description: 'Called by the on-premise agent during startup to register itself',
  })
  @ApiResponse({ status: 200, description: 'Agent registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or already registered' })
  async registerAgent(
    @Body() dto: RegisterAgentDto,
    @Ip() ipAddress: string,
  ) {
    return this.agentsService.registerAgent(dto, ipAddress);
  }

  @Public()
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Agent heartbeat',
    description: 'Called by the agent every 30 seconds to report status',
  })
  @ApiResponse({ status: 200, description: 'Heartbeat received' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async heartbeat(@Body() dto: HeartbeatDto) {
    return this.agentsService.processHeartbeat(dto);
  }

  // ============================================================
  // PROTECTED ENDPOINTS (Called by SaaS Frontend/Admin)
  // ============================================================

  @Post('generate-token')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a new agent token for an organization',
    description: 'Creates a new agent with a unique token for on-premise installation',
  })
  @ApiResponse({ status: 201, description: 'Token generated successfully' })
  async generateToken(
    @OrganizationId() organizationId: string,
    @Body() dto: GenerateTokenDto,
  ) {
    return this.agentsService.generateAgentToken(organizationId, dto);
  }

  @Get('status')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get agent status for current organization',
  })
  async getAgentStatus(@OrganizationId() organizationId: string) {
    return this.agentsService.getAgentStatusByOrg(organizationId);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get agent details by ID',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getAgent(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    const agent = await this.agentsService.getAgentById(id);
    
    // Ensure tenant isolation
    if (agent.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied to this agent');
    }
    
    return agent;
  }

  @Post(':id/regenerate-token')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Regenerate agent token (invalidates old token, resets 30-day expiry)',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async regenerateToken(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.regenerateToken(id, organizationId);
  }

  @Post(':id/revoke')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'agents' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke agent token (Section 2.4)',
    description:
      "Révoque immédiatement le token de l'agent. L'agent ne pourra plus se connecter jusqu'à ce qu'un nouveau token soit généré.",
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Token révoqué avec succès' })
  @ApiResponse({ status: 400, description: 'Token déjà révoqué' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Agent introuvable' })
  async revokeToken(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.revokeToken(id, organizationId);
  }
}
