import {
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationId } from '../auth/decorators/organization.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Récupérer mon organisation',
    description: 'Retourne les informations de l\'organisation de l\'utilisateur courant, avec le plan d\'abonnement et le statut d\'onboarding.',
  })
  async getMyOrganization(@OrganizationId() organizationId: string) {
    return this.organizationsService.findMine(organizationId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Mettre à jour mon organisation',
    description: 'Met à jour les informations de base de l\'organisation (nom, secteur, taille, pays).',
  })
  async updateMyOrganization(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateMine(organizationId, userId, dto);
  }
}
