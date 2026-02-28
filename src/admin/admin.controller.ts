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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'all' }) // Only InsightSage developers/superadmins can access this Controller
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
