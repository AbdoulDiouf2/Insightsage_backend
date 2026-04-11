import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { OrganizationId } from '../auth/decorators/organization.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { AgentLinkDto } from './dto/agent-link.dto';
import { Step4Dto } from './dto/step4.dto';
import { Step5Dto } from './dto/step5.dto';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Statut du wizard d onboarding',
    description:
      'Retourne l etape courante, les etapes completees et les infos de l organisation. Permet de reprendre l onboarding a l etape en cours.',
  })
  async getStatus(@OrganizationId() organizationId: string) {
    return this.onboardingService.getStatus(organizationId);
  }

  @Post('step1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Etape 1 : Choix du plan d abonnement',
    description: 'Selectionne le plan d abonnement pour l organisation (startup, pme, business, enterprise).',
  })
  async step1(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: Step1Dto,
  ) {
    return this.onboardingService.step1(organizationId, userId, dto);
  }

  @Post('step2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Etape 2 : Profil organisation',
    description: 'Met a jour les informations de l organisation : nom, secteur, taille, pays.',
  })
  async step2(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: Step2Dto,
  ) {
    return this.onboardingService.step2(organizationId, userId, dto);
  }

  @Post('step3')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Etape 3 : Configuration data source Sage',
    description: 'Configure le type de solution Sage (X3 ou 100) et le mode d hebergement (local ou cloud).',
  })
  async step3(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: Step3Dto,
  ) {
    return this.onboardingService.step3(organizationId, userId, dto);
  }

  @Get('agent-releases')
  @ApiOperation({
    summary: 'Dernières releases de l\'agent par plateforme',
    description:
      'Retourne les fichiers exécutables de l\'agent disponibles au téléchargement (une release par plateforme marquée isLatest).',
  })
  getAgentReleases() {
    return this.onboardingService.getAgentReleases();
  }

  @Post('agent-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liaison agent : lier un token agent ou reporter la configuration',
    description:
      'Associe un agent on-premise via son token, ou reporte la configuration en passant skipLater: true.',
  })
  async linkAgent(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AgentLinkDto,
  ) {
    return this.onboardingService.linkAgent(organizationId, userId, dto);
  }

  @Get('profiles')
  @ApiOperation({
    summary: 'Profils metiers disponibles',
    description: 'Retourne la liste des profils metiers selectionables pour l organisation (DAF, DG, Controller, Manager, Analyste).',
  })
  getProfiles() {
    return this.onboardingService.getAvailableProfiles();
  }

  @Post('step4')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Etape 4 : Selection des profils metiers',
    description: 'Enregistre les profils metiers actives pour l organisation.',
  })
  async step4(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: Step4Dto,
  ) {
    return this.onboardingService.step4(organizationId, userId, dto);
  }

  @Post('step5')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Etape 5 : Invitations utilisateurs',
    description:
      'Invite des utilisateurs par email avec un role attribue. Utiliser inviteLater: true pour passer cette etape et inviter plus tard.',
  })
  async step5(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: Step5Dto,
  ) {
    return this.onboardingService.step5(organizationId, userId, dto);
  }
}
