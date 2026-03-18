import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { Public, RequirePermissions, CurrentUser } from './decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @SkipThrottle()
  @Get('invitation-info')
  @ApiOperation({
    summary: 'Récupère les infos d\'une invitation par token (email, org) pour pré-remplir le formulaire',
  })
  @ApiResponse({ status: 200, description: 'Invitation info returned' })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async getInvitationInfo(@Query('token') token: string) {
    return this.authService.getInvitationInfo(token);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 inscriptions/min par IP
  @Post('register')
  @ApiOperation({
    summary: 'Join an organization via invitation token',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Missing or invalid invitation',
  })
  async register(@Body() dto: RegisterDto) {
    if (!dto.invitationToken) {
      throw new BadRequestException(
        'Public registration is disabled. An invitation token is required to join an organization.',
      );
    }
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 5 } }) // 5 inscriptions/heure par IP
  @Post('signup')
  @ApiOperation({ summary: 'Créer un compte et une organisation (auto-inscription)' })
  @ApiResponse({ status: 201, description: 'Compte et organisation créés' })
  @ApiResponse({ status: 400, description: 'Email déjà utilisé ou données invalides' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 tentatives/min par IP (anti brute-force)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @SkipThrottle() // Logout ne nécessite pas de rate limiting
  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Public()
  @SkipThrottle() // Le refresh est déjà protégé par le token signé
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  async refreshTokens(
    @CurrentUser('id') userId: string,
    @CurrentUser('refreshToken') refreshToken: string,
  ) {
    return this.authService.refreshTokens(userId, refreshToken);
  }

  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 3 } }) // 3 demandes/heure par IP (anti spam email)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset link' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 tentatives/min par IP
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier son propre mot de passe (utilisateur authentifié)' })
  @ApiResponse({ status: 200, description: 'Mot de passe modifié avec succès' })
  @ApiResponse({ status: 400, description: 'Mot de passe actuel incorrect' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'users' })
  @Post('invite')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite a user to an organization' })
  @ApiResponse({ status: 200, description: 'Invitation sent successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async inviteUser(
    @Body() dto: InviteUserDto,
    @CurrentUser() requester: any,
  ) {
    const requesterOrgId = requester.organizationId;

    // Check if requester is a SuperAdmin (manage:all)
    const isSuperAdmin = requester.userRoles?.some((ur: any) =>
      ur.role?.permissions?.some((rp: any) =>
        rp.permission?.action === 'manage' && rp.permission?.resource === 'all'
      )
    );

    // Ensure non-superadmins can only invite to their own organization
    if (!isSuperAdmin && dto.organizationId !== requesterOrgId) {
      throw new BadRequestException(
        'You can only invite users to your own organization.',
      );
    }
    return this.authService.inviteUser(dto, requester.id);
  }
}
