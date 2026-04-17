import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AuditLogService } from '../logs/audit-log.service';
import { LicenseGuardianService } from '../subscriptions/license-guardian.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private notifications: NotificationsService,
  ) { }

  // GET /auth/invitation-info?token=xxx
  async getInvitationInfo(token: string) {
    if (!token) throw new BadRequestException('Token requis.');

    const tokenHash = this.hashToken(token);
    const invite = await this.prisma.invitation.findUnique({
      where: { token: tokenHash },
      select: {
        email: true,
        isAccepted: true,
        expiresAt: true,
        organization: { select: { name: true } },
        role: { select: { name: true } },
      },
    });

    if (!invite) throw new BadRequestException('Invitation introuvable ou invalide.');
    if (invite.isAccepted) throw new BadRequestException('Cette invitation a déjà été utilisée.');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Cette invitation a expiré.');

    return {
      email: invite.email,
      organizationName: invite.organization?.name ?? '',
      role: invite.role?.name ?? '',
    };
  }

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
    const passwordHash = await bcrypt.hash(password, 12);

    const invite = await this.prisma.invitation.findUnique({
      where: { token: this.hashToken(invitationToken) },
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

  async signup(dto: SignupDto) {
    // 1. Vérifier unicité email
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Cet email est déjà utilisé.');
    }

    // 2. Bloquer si un domaine professionnel est déjà enregistré
    const domain = dto.email.split('@')[1]?.toLowerCase();
    const PUBLIC_DOMAINS = [
      'gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr',
      'outlook.com', 'live.com', 'live.fr', 'icloud.com', 'orange.fr',
      'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr', 'bbox.fr',
      'numericable.fr', 'aol.com', 'protonmail.com', 'pm.me',
    ];
    if (domain && !PUBLIC_DOMAINS.includes(domain)) {
      const existingDomainUser = await this.prisma.user.findFirst({
        where: { email: { endsWith: `@${domain}` } },
      });
      if (existingDomainUser) {
        throw new BadRequestException(
          `Une organisation utilisant le domaine @${domain} est déjà inscrite. ` +
          `Contactez votre administrateur pour recevoir une invitation d'accès.`,
        );
      }
    }

    // 3. Bloquer si le nom d'organisation est déjà pris (insensible à la casse)
    const existingOrg = await this.prisma.organization.findFirst({
      where: { name: { equals: dto.organizationName, mode: 'insensitive' } },
    });
    if (existingOrg) {
      throw new BadRequestException(
        `Une organisation nommée "${dto.organizationName}" est déjà inscrite. ` +
        `Contactez votre administrateur pour recevoir une invitation d'accès.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 2. Trouver le rôle système "owner"
    const ownerRole = await this.prisma.role.findFirst({
      where: { name: 'owner', isSystem: true },
    });
    if (!ownerRole) {
      throw new BadRequestException('Le rôle système "owner" est introuvable.');
    }

    // 3. Créer org + user + userRole + onboardingStatus en une transaction
    const { user, organization } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.organizationName },
      });

      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          organizationId: org.id,
          userRoles: { create: [{ roleId: ownerRole.id }] },
        },
      });

      await tx.organization.update({
        where: { id: org.id },
        data: { ownerId: newUser.id },
      });

      await tx.onboardingStatus.create({
        data: { organizationId: org.id, currentStep: 1 },
      });

      return { user: newUser, organization: org };
    });

    // 4. Émettre les tokens JWT
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    // 5. Audit log
    await this.auditLog.log({
      organizationId: organization.id,
      userId: user.id,
      event: 'organization_created',
      payload: { organizationName: organization.name, method: 'signup' },
    });

    // 6. Email de bienvenue (fire-and-forget — ne bloque pas la réponse)
    this.mailer.sendWelcomeEmail(user.email, user.firstName ?? '', organization.name).catch((err: Error) => {
      console.warn(`[AuthService] Échec envoi email de bienvenue pour ${user.email}: ${err.message}`);
    });

    // 7. Notifier les admins configurés
    this.notifications.notifyNewOrg(organization.name, dto.email).catch(() => {});

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: organization.id,
      },
    };
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
    const tokenHash = this.hashToken(token);
    const resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.update(user.id, {
      resetPasswordToken: tokenHash, // Seul le hash est stocké en DB
      resetPasswordExpires,
    });

    await this.mailer.sendResetPasswordEmail(user.email, token, dto.source ?? 'client'); // Token brut dans l'email

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
    const tokenHash = this.hashToken(dto.token);
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Mot de passe actuel incorrect.');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.usersService.update(userId, { passwordHash });

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'password_reset_completed',
      payload: { method: 'self_change' },
    });

    return { message: 'Mot de passe modifié avec succès.' };
  }

  async inviteUser(dto: InviteUserDto, invitedById?: string) {
    // Vérification de la limite de licence par le Gardien
    await this.licenseGuardian.assertLimit(dto.organizationId, 'maxUsers');

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('User already exists in the system');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
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

    try {
      await this.prisma.invitation.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: role.id,
          token: tokenHash, // Seul le hash est stocké en DB
          expiresAt,
          organizationId: dto.organizationId,
          invitedById,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('This email has already been invited.');
      }
      throw error;
    }

    await this.mailer.sendInvitationEmail(
      dto.email,
      token, // Token brut dans l'email
      organization?.name ?? '',
      dto.role,
    );

    await this.auditLog.log({
      organizationId: dto.organizationId,
      userId: invitedById,
      event: 'user_invited',
      payload: { email: dto.email, role: dto.role },
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
    const hash = await bcrypt.hash(refreshToken, 12);
    await this.usersService.update(userId, { hashedRefreshToken: hash });
  }

  /**
   * Hash un token aléatoire avec SHA-256 avant stockage en DB.
   * Le token brut est envoyé par email ; seul le hash est persisté.
   * Ainsi, une compromission de la DB n'expose pas les tokens actifs.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
