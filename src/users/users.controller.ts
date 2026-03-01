import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, CurrentUser, OrganizationId } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // -------------------------------------------------------------
  // PROFILE ENDPOINTS (Accessible by any authenticated user)
  // -------------------------------------------------------------

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns user profile excluding password',
  })
  async getProfile(@CurrentUser('id') userId: string) {
    const user = await this.usersService.findByIdSafe(userId);
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }
    return user;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    // A user cannot change their own roles or organization via /me endpoints
    const { roleIds, ...allowedUpdates } = dto;
    return this.usersService.update(userId, allowedUpdates);
  }

  // -------------------------------------------------------------
  // TEAM MANAGEMENT ENDPOINTS (Restricted to DAF / Admin)
  // -------------------------------------------------------------

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'users' })
  @ApiOperation({ summary: 'List all users in your organization' })
  @ApiResponse({ status: 200, description: 'Returns an array of users' })
  async getTeamUsers(@OrganizationId() organizationId: string) {
    if (!organizationId) {
      throw new ForbiddenException('You do not belong to an organization.');
    }
    return this.usersService.findAllByOrganization(organizationId);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'users' })
  @ApiOperation({
    summary: 'Get details of a specific user in your organization',
  })
  async getTeamUser(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    if (organizationId !== targetUser.organizationId) {
      throw new ForbiddenException(
        'You cannot access users outside your organization.',
      );
    }

    return targetUser;
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'users' })
  @ApiOperation({
    summary: 'Update a user in your organization (e.g. change role)',
  })
  async updateTeamUser(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    // Multi-tenant isolation
    if (organizationId !== targetUser.organizationId) {
      throw new ForbiddenException(
        'You cannot modify users outside your organization.',
      );
    }

    const { roleIds, ...restDto } = dto;
    const updatePayload: any = { ...restDto };

    // Re-map roleIds to userRoles relational creation
    if (roleIds) {
      updatePayload.userRoles = {
        deleteMany: {},
        create: roleIds.map((rId) => ({ roleId: rId })),
      };
    }

    return this.usersService.update(id, updatePayload);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'users' })
  @ApiOperation({ summary: 'Remove a user from your organization' })
  async deleteTeamUser(
    @CurrentUser('id') requesterId: string,
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    if (requesterId === id) {
      throw new ForbiddenException('You cannot delete your own account here.');
    }

    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    if (organizationId !== targetUser.organizationId) {
      throw new ForbiddenException(
        'You cannot delete users outside your organization.',
      );
    }

    return this.usersService.remove(id);
  }
}
