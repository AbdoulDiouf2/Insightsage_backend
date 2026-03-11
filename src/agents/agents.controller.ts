import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AgentsService } from './agents.service';
import { AgentsGateway } from './agents.gateway';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { ExecuteQueryDto } from './dto/execute-query.dto';
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
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsGateway: AgentsGateway,
  ) { }

  // ============================================================
  // PUBLIC ENDPOINTS (Called by Agent On-Premise)
  // ============================================================

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 inscriptions/min par IP (agent on-prem)
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
  @Throttle({ default: { ttl: 60000, limit: 120 } }) // 120/min : heartbeat toutes les 30s = 2/min par agent, marge x60
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

  @Post(':id/test-connection')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test real-time connection using SELECT 1',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async testConnection(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    const agent = await this.agentsService.getAgentById(id);
    if (agent.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied to this agent');
    }

    // Trigger real-time SELECT 1
    return this.agentsService.executeRealTimeQuery(
      organizationId,
      'SELECT 1',
      this.agentsGateway,
    );
  }

  // ============================================================
  // REAL-TIME & JOB ENDPOINTS
  // ============================================================

  @Post('query')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'dashboards' }) // Execution permission
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute a real-time SQL query via the agent (NLQ Bridge)',
  })
  async executeQuery(
    @OrganizationId() organizationId: string,
    @Body() dto: ExecuteQueryDto,
  ) {
    return this.agentsService.executeRealTimeQuery(
      organizationId,
      dto.sql,
      this.agentsGateway
    );
  }

  @Get(':id/job-stats')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get job stats (count per status) for a specific agent' })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getJobStats(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.getJobStats(id, organizationId);
  }

  @Get(':id/logs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get logs for a specific agent',
    description: 'Returns a paginated list of logs sent by the agent',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getAgentLogs(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
  ) {
    return this.agentsService.getAgentLogs(
      organizationId,
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search,
    );
  }

  @Get(':id/jobs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get job history for a specific agent',
    description: 'Returns a paginated list of jobs (SQL queries) executed by the agent',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getAgentJobs(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('search') search: string,
  ) {
    return this.agentsService.getAgentJobs(
      organizationId,
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status as any,
      search,
    );
  }

  @Get('jobs/:jobId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the status and result of a specific agent job',
  })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.getJobById(jobId, organizationId);
  }
}
