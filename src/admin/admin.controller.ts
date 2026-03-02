import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Delete,
  Param,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from './dto/subscription-plan.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'all' }) // Only InsightSage developers/superadmins
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get overall system statistics for dashboard' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Post('clients')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Onboard a new client organization and its root DAF',
  })
  @ApiResponse({ status: 201, description: 'Client created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires superadmin role',
  })
  async createClient(@Body() dto: CreateClientDto) {
    return this.adminService.createClientAccount(dto);
  }

  // --- Organizations Management ---

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations (SuperAdmin only)' })
  async findAllOrganizations() {
    return this.adminService.findAllOrganizations();
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Update organization details' })
  async updateOrganization(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.adminService.updateOrganization(id, dto);
  }

  @Delete('organizations/:id')
  @ApiOperation({ summary: 'Delete an organization and all its data' })
  async deleteOrganization(@Param('id') id: string) {
    return this.adminService.deleteOrganization(id);
  }

  // --- Users Management ---

  @Get('users')
  @ApiOperation({ summary: 'List all users across all organizations' })
  async findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user details' })
  async updateUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user' })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // --- Audit Logs ---

  @Get('audit-logs')
  @ApiOperation({ summary: 'View system-wide audit logs' })
  async findAllAuditLogs() {
    return this.adminService.findAllAuditLogs();
  }

  // --- Subscription Plans Management ---

  @Get('subscription-plans')
  @ApiOperation({
    summary: 'Lister tous les plans d\'abonnement (actifs et inactifs)',
    description: 'Réservé aux superadmins. Retourne tous les plans avec le nombre d\'organisations associées.',
  })
  async findAllSubscriptionPlans() {
    return this.adminService.findAllSubscriptionPlans();
  }

  @Post('subscription-plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouveau plan d\'abonnement',
    description: 'Permet d\'ajouter un nouveau palier sans redéploiement.',
  })
  async createSubscriptionPlan(@Body() dto: CreateSubscriptionPlanDto) {
    return this.adminService.createSubscriptionPlan(dto);
  }

  @Patch('subscription-plans/:id')
  @ApiOperation({
    summary: 'Modifier un plan d\'abonnement',
    description: 'Modifier prix, limites, feature flags ou informations Stripe sans redéploiement.',
  })
  async updateSubscriptionPlan(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.adminService.updateSubscriptionPlan(id, dto);
  }

  @Delete('subscription-plans/:id')
  @ApiOperation({
    summary: 'Désactiver un plan d\'abonnement',
    description: 'Désactive le plan (isActive = false) sans supprimer les données.',
  })
  async deactivateSubscriptionPlan(@Param('id') id: string) {
    return this.adminService.deactivateSubscriptionPlan(id);
  }
}
