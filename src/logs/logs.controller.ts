import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { LogsService } from './logs.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, OrganizationId } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Logs')
@Controller('logs')
@ApiBearerAuth()
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('audit')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'logs' })
  @ApiOperation({ summary: 'Get audit logs for your organization' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'event',
    required: false,
    description: 'Filter by event type',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (ISO format)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Results per page (max 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Pagination offset',
  })
  @ApiQuery({
    name: 'events',
    required: false,
    description: 'Filter by multiple event types (comma-separated)',
  })
  async getAuditLogs(
    @OrganizationId() organizationId: string,
    @Query('userId') userId?: string,
    @Query('event') event?: string,
    @Query('events') eventsRaw?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const events = eventsRaw ? eventsRaw.split(',').filter(Boolean) : undefined;
    return this.logsService.findAll(organizationId, {
      userId,
      event,
      events,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    });
  }

  @Get('audit/events')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'logs' })
  @ApiOperation({ summary: 'Get available event types with counts' })
  async getEventTypes(@OrganizationId() organizationId: string) {
    return this.logsService.getEventTypes(organizationId);
  }

  @Get('audit/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'logs' })
  @ApiOperation({ summary: 'Get a single audit log entry by ID' })
  async getAuditLogById(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.logsService.findById(id, organizationId);
  }
}
