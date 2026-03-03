import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WidgetsService } from './widgets.service';
import { OrganizationId, RequirePermissions } from '../auth/decorators';
import { PermissionsGuard } from '../auth/guards';

@ApiTags('Widget Store')
@ApiBearerAuth()
@Controller('widget-store')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get()
  @RequirePermissions({ action: 'read', resource: 'widgets' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Catalogue Widget Store',
    description:
      "Retourne les KPI packs disponibles selon le plan d'abonnement de l'organisation, les KPI definitions et les widget templates. Filtrable par profil métier.",
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    description: 'Profil métier pour filtrer les packs (daf, dg, controller, manager, analyst)',
    example: 'daf',
  })
  getStore(
    @OrganizationId() organizationId: string,
    @Query('profile') profile?: string,
  ) {
    return this.widgetsService.getStore(organizationId, profile);
  }
}
