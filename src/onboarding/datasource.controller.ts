import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { OrganizationId } from '../auth/decorators/organization.decorator';
import { TestConnectionDto } from './dto/test-connection.dto';

@ApiTags('Datasource')
@ApiBearerAuth()
@Controller('datasource')
export class DatasourceController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tester la connexion via agent (MVP)',
    description:
      'Verifie si un agent est actif et accessible pour l organisation courante. ' +
      'En MVP, verifie uniquement le statut de l agent (online/offline). ' +
      'Si agentToken est omis, utilise le premier agent online de l organisation.',
  })
  async testConnection(
    @OrganizationId() organizationId: string,
    @Body() dto: TestConnectionDto,
  ) {
    return this.onboardingService.testConnection(organizationId, dto);
  }
}
