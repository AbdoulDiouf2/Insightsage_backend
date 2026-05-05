import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NlqService } from './nlq.service';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';
import { OrganizationId } from '../auth/decorators/organization.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { NlqQueryDto } from './dto/nlq-query.dto';
import { NlqAddToDashboardDto } from './dto/nlq-add-to-dashboard.dto';

@ApiTags('NLQ')
@ApiBearerAuth()
@Controller('nlq')
@SkipThrottle()
@UseGuards(SubscriptionGuard, PermissionsGuard)
@RequiresFeature('hasNlq')
export class NlqController {
    constructor(private readonly nlqService: NlqService) { }

    @Post('query')
    @HttpCode(HttpStatus.OK)
    @RequirePermissions({ action: 'read', resource: 'dashboards' })
    @ApiOperation({
        summary: 'Poser une question en langage naturel',
        description:
            'Analyse la question, detecte l intention, recupere le template SQL correspondant au type de Sage de l organisation, et execute la requete via l agent.',
    })
    async query(
        @OrganizationId() organizationId: string,
        @CurrentUser('id') userId: string,
        @Body() dto: NlqQueryDto,
    ) {
        return this.nlqService.processQuery(organizationId, userId, dto.query);
    }

    @Post('add-to-dashboard')
    @HttpCode(HttpStatus.CREATED)
    @RequirePermissions({ action: 'write', resource: 'dashboards' })
    @ApiOperation({
        summary: 'Ajouter une recherche NLQ au dashboard',
        description:
            'Cree un widget permanent sur un dashboard a partir d une session NLQ reussie.',
    })
    async addToDashboard(
        @OrganizationId() organizationId: string,
        @CurrentUser('id') userId: string,
        @Body() dto: NlqAddToDashboardDto,
    ) {
        return this.nlqService.addToDashboard(
            organizationId,
            userId,
            dto.sessionId,
            dto.dashboardId,
            dto.name,
            dto.position,
        );
    }
}
