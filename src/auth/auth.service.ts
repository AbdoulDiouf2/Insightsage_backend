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
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private prisma: PrismaService,
    ) { }

    async register(dto: RegisterDto) {
        // Check if user already exists
        const existingUser = await this.usersService.findByEmail(dto.email);
        if (existingUser) {
            throw new BadRequestException('User already exists');
        }

        const { email, password, organizationName, firstName, lastName, invitationToken } = dto;
        const passwordHash = await bcrypt.hash(password, 10);
        let organizationId: string;
        let role = 'owner';

        if (invitationToken) {
            // Logic to resolve organization and role from invitation
            const invite = await this.prisma.invitation.findUnique({
                where: { token: invitationToken },
            });
            if (!invite || invite.email !== email || invite.isAccepted || invite.expiresAt < new Date()) {
                throw new BadRequestException('Invalid or expired invitation token');
            }
            organizationId = invite.organizationId;
            role = invite.role;

            // Mark invite as accepted
            await this.prisma.invitation.update({
                where: { id: invite.id },
                data: { isAccepted: true },
            });
        } else {
            // Create new organization for the user
            const org = await this.prisma.organization.create({
                data: {
                    name: organizationName,
                    size: 'pme', // Default value
                },
            });
            organizationId = org.id;
        }

        const user = await this.usersService.create({
            email,
            passwordHash,
            firstName,
            lastName,
            role,
            organization: { connect: { id: organizationId } },
        });

        // If they created the organization, set them as the owner (Optional, based on schema relation)
        if (!invitationToken) {
            await this.prisma.organization.update({
                where: { id: organizationId },
                data: { ownerId: user.id },
            });
        }

        const tokens = await this.getTokens(user.id, user.email);
        await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
        return tokens;
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const tokens = await this.getTokens(user.id, user.email);
        await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
        return tokens;
    }

    async logout(userId: string) {
        await this.usersService.update(userId, { hashedRefreshToken: null });
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
            return { message: 'If that email is in our database, we will send a reset link.' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

        await this.usersService.update(user.id, {
            resetPasswordToken: token,
            resetPasswordExpires,
        });

        // In a real application, send the email here
        // e.g. await this.emailService.sendResetPasswordEmail(user.email, token);
        console.log(`Reset token for ${user.email}: ${token}`);

        const isProd = this.configService.get<string>('NODE_ENV') === 'production';
        if (!isProd) {
            return {
                message: 'If that email is in our database, we will send a reset link.',
                debug: { resetToken: token } // Expose token directly for development testing
            };
        }

        return { message: 'If that email is in our database, we will send a reset link.' };
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

        return { message: 'Password reset successfully' };
    }

    async inviteUser(dto: InviteUserDto) {
        const existingUser = await this.usersService.findByEmail(dto.email);
        if (existingUser) {
            throw new BadRequestException('User already exists in the system');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days

        await this.prisma.invitation.create({
            data: {
                email: dto.email,
                role: dto.role,
                token,
                expiresAt,
                organizationId: dto.organizationId,
            },
        });

        // In a real application, send the invitation email here
        console.log(`Invitation token for ${dto.email}: ${token}`);

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
