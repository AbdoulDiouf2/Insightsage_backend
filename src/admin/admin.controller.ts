import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateClientDto } from './dto/create-client.dto';
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
}
