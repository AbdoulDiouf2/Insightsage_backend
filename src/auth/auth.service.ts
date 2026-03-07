import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AuditLogService } from '../logs/audit-log.service';
import { LicenseGuardianService } from '../subscriptions/license-guardian.service';
import { MailerService } from '../mailer/mailer.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private licenseGuardian: LicenseGuardianService,
    private mailer: MailerService,
  ) { }

  async register(dto: RegisterDto) {
    if (!dto.invitationToken) {
      throw new BadRequestException('Invitation token is required.');
    }

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const { email, password, firstName, lastName, invitationToken } = dto;
    const passwordHash = await bcrypt.hash(password, 10);

    const invite = await this.prisma.invitation.findUnique({
      where: { token: invitationToken },
    });

    if (
      !invite ||
      invite.email !== email ||
      invite.isAccepted ||
      invite.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    // Mark invite as accepted
    await this.prisma.invitation.update({
      where: { id: invite.id },
      data: { isAccepted: true },
    });

    const user = await this.usersService.create({
      email,
      passwordHash,
      firstName,
      lastName,
      organization: { connect: { id: invite.organizationId } },
      userRoles: {
        create: [{ roleId: invite.roleId }],
      },
    });

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    await this.auditLog.log({
      organizationId: invite.organizationId,
      userId: user.id,
      event: 'user_created',
      payload: { email: user.email, method: 'invitation' },
    });

    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'user_login',
      payload: { email: user.email },
    });

    return tokens;
  }

  async logout(userId: string) {
    const user = await this.usersService.findById(userId);
    await this.usersService.update(userId, { hashedRefreshToken: null });

    if (user) {
      await this.auditLog.log({
        organizationId: user.organizationId,
        userId: user.id,
        event: 'user_logout',
      });
    }

    return { message: 'Logged out successfully' };
  }

  async refreshTokens(userId: string, rt: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const rtMatches = await bcrypt.compare(rt, user.hashedRefreshToken);
    if (!rtMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    return tokens;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return {
        message: 'If that email is in our database, we will send a reset link.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.update(user.id, {
      resetPasswordToken: token,
      resetPasswordExpires,
    });

    await this.mailer.sendResetPasswordEmail(user.email, token);

    // L'audit log est toujours déclenché (y compris en dev) — Section 2.3
    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'password_reset_requested',
      payload: { userId: user.id },
    });

    return {
      message: 'If that email is in our database, we will send a reset link.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: dto.token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(user.id, {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'password_reset_completed',
      payload: { email: user.email },
    });

    return { message: 'Password reset successfully' };
  }

  async inviteUser(dto: InviteUserDto, invitedById?: string) {
    // Vérification de la limite de licence par le Gardien
    await this.licenseGuardian.assertLimit(dto.organizationId, 'maxUsers');

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('User already exists in the system');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days

    const role = await this.prisma.role.findFirst({
      where: {
        name: dto.role,
        OR: [{ isSystem: true }, { organizationId: dto.organizationId }],
      },
    });

    if (!role) {
      throw new BadRequestException('The specified role does not exist.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
      select: { name: true },
    });

    await this.prisma.invitation.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: role.id,
        token,
        expiresAt,
        organizationId: dto.organizationId,
        invitedById,
      },
    });

    await this.mailer.sendInvitationEmail(
      dto.email,
      token,
      organization?.name ?? '',
      dto.role,
    );

    await this.auditLog.log({
      organizationId: dto.organizationId,
      event: 'user_invited',
      payload: { email: dto.email, role: dto.role, invitedBy: invitedById },
    });

    return { message: 'Invitation sent successfully' };
  }

  private async getTokens(userId: string, email: string) {
    const jwtPayload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.update(userId, { hashedRefreshToken: hash });
  }
}
