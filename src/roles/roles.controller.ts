import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user: { id: string; organizationId: string };
}

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermissions({ action: 'read', resource: 'roles' })
  @ApiOperation({
    summary: 'Obtenir la matrice complète des permissions disponibles',
  })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Post()
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({
    summary: 'Créer un nouveau rôle sur-mesure pour votre organisation',
  })
  create(@Req() req: RequestWithUser, @Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(req.user.organizationId, createRoleDto);
  }

  @Get()
  @RequirePermissions({ action: 'read', resource: 'roles' })
  @ApiOperation({
    summary:
      'Lister les rôles (systèmes & personnalisés) de votre organisation',
  })
  findAll(@Req() req: RequestWithUser) {
    return this.rolesService.findAllByOrganization(req.user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({ summary: 'Mettre à jour un rôle sur-mesure existant' })
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, req.user.organizationId, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermissions({ action: 'manage', resource: 'roles' })
  @ApiOperation({
    summary: 'Supprimer un rôle personnalisé de votre organisation',
  })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.rolesService.remove(id, req.user.organizationId);
  }
}
