import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, OrganizationId } from '../auth/decorators';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Roles')
@Controller('roles')
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'roles' })
  @ApiOperation({
    summary: 'Obtenir la matrice complète des permissions disponibles',
  })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({
    summary: 'Créer un nouveau rôle sur-mesure pour votre organisation',
  })
  create(
    @OrganizationId() organizationId: string,
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(organizationId, createRoleDto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'roles' })
  @ApiOperation({
    summary:
      'Lister les rôles (systèmes & personnalisés) de votre organisation',
  })
  findAll(@OrganizationId() organizationId: string) {
    return this.rolesService.findAllByOrganization(organizationId);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'roles' })
  @ApiOperation({ summary: 'Récupérer les détails d\'un rôle spécifique' })
  findOne(@OrganizationId() organizationId: string, @Param('id') id: string) {
    return this.rolesService.findOne(id, organizationId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({ summary: 'Mettre à jour un rôle sur-mesure existant' })
  update(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, organizationId, updateRoleDto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({
    summary: 'Supprimer un rôle personnalisé de votre organisation',
  })
  remove(@OrganizationId() organizationId: string, @Param('id') id: string) {
    return this.rolesService.remove(id, organizationId);
  }
}
