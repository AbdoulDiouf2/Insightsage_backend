import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user: { id: string; role: string; email: string };
}

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // -------------------------------------------------------------
  // PROFILE ENDPOINTS (Accessible by any authenticated user)
  // -------------------------------------------------------------

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns user profile excluding password',
  })
  async getProfile(@Req() req: RequestWithUser) {
    const user = await this.usersService.findByIdSafe(req.user.id);
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }
    return user;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  async updateProfile(@Req() req: RequestWithUser, @Body() dto: UpdateUserDto) {
    // A user cannot change their own roles or organization via /me endpoints
    const { roleIds, ...allowedUpdates } = dto;
    return this.usersService.update(req.user.id, allowedUpdates);
  }

  // -------------------------------------------------------------
  // TEAM MANAGEMENT ENDPOINTS (Restricted to DAF / Admin)
  // -------------------------------------------------------------

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'users' })
  @ApiOperation({ summary: 'List all users in your organization' })
  @ApiResponse({ status: 200, description: 'Returns an array of users' })
  async getTeamUsers(@Req() req: RequestWithUser) {
    const requester = await this.usersService.findByIdSafe(req.user.id);
    if (!requester || !requester.organizationId) {
      throw new ForbiddenException('You do not belong to an organization.');
    }
    return this.usersService.findAllByOrganization(requester.organizationId);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'users' })
  @ApiOperation({
    summary: 'Get details of a specific user in your organization',
  })
  async getTeamUser(@Req() req: RequestWithUser, @Param('id') id: string) {
    const requester = await this.usersService.findByIdSafe(req.user.id);
    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!requester || !requester.organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    if (requester.organizationId !== targetUser.organizationId) {
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
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const requester = await this.usersService.findByIdSafe(req.user.id);
    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!requester || !requester.organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    // Multi-tenant isolation
    if (requester.organizationId !== targetUser.organizationId) {
      throw new ForbiddenException(
        'You cannot modify users outside your organization.',
      );
    }
    // Prevent privilege escalation logic if needed (optional for MVP)
    // A user shouldn't remove their own 'daf' role here ideally, but we'll focus on the data structure first.

    const { roleIds, ...restDto } = dto;
    const updatePayload: any = { ...restDto }; // Prisma accepts this as UserUpdateInput mostly

    // Re-map roleIds to userRoles relational creation
    if (roleIds) {
      updatePayload.userRoles = {
        deleteMany: {}, // Clear previous roles
        create: roleIds.map((rId) => ({ roleId: rId })), // Add new roles
      };
    }

    return this.usersService.update(id, updatePayload);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'users' })
  @ApiOperation({ summary: 'Remove a user from your organization' })
  async deleteTeamUser(@Req() req: RequestWithUser, @Param('id') id: string) {
    if (req.user.id === id) {
      throw new ForbiddenException('You cannot delete your own account here.');
    }

    const requester = await this.usersService.findByIdSafe(req.user.id);
    const targetUser = await this.usersService.findByIdSafe(id);

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!requester || !requester.organizationId) {
      throw new ForbiddenException('Invalid requester account.');
    }
    if (requester.organizationId !== targetUser.organizationId) {
      throw new ForbiddenException(
        'You cannot delete users outside your organization.',
      );
    }

    return this.usersService.remove(id);
  }
}
