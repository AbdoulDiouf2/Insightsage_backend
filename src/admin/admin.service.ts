import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async createClientAccount(dto: CreateClientDto) {
    // 1. Verify if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists.');
    }

    // 2. We use a transaction to ensure both Org and User are created at the same time
    return this.prisma.$transaction(async (tx) => {
      // A. Create the Organization
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          size: 'pme', // Default or based on future DTO extensions
        },
      });

      // B. Get the 'daf' system role ID
      const dafRole = await tx.role.findFirst({
        where: { name: 'daf', isSystem: true, organizationId: null },
      });
      if (!dafRole) {
        throw new BadRequestException(
          'System roles not found. Please run database seed.',
        );
      }

      // C. Prepare the Welcome / Reset Password Token
      const token = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpires = new Date(Date.now() + 7 * 24 * 3600000); // 7 days max to click

      // Generate a random temporary password (never communicated, just to satisfy the DB schema)
      const randomTempPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomTempPassword, 10);

      // D. Create the Root User
      const user = await tx.user.create({
        data: {
          email: dto.adminEmail,
          passwordHash,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          organizationId: organization.id,
          resetPasswordToken: token,
          resetPasswordExpires,
          userRoles: {
            create: [{ roleId: dafRole.id }],
          },
        },
      });

      // D. Set User as the Organization Owner
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerId: user.id },
      });

      // E. (Optional / ToDo) Send Welcome Email with the link:
      // https://your-front.com/reset-password?token=${token}

      return {
        message: 'Client organization and root user created successfully.',
        organizationId: organization.id,
        userId: user.id,
        debug: {
          // Temporarily return the reset token here so you can test the onboarding flow
          // without an actual email provider in place yet.
          setupToken: token,
        },
      };
    });
  }
}
