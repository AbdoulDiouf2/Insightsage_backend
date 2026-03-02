import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Public()
  @Get('plans')
  @ApiOperation({
    summary: 'Lister les plans d\'abonnement disponibles',
    description: 'Retourne tous les plans actifs avec leurs limites et fonctionnalités. Endpoint public (sans authentification).',
  })
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }
}
