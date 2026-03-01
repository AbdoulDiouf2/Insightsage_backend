import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { AuditLogService } from '../logs/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) { }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByIdSafe(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
  }

  async findAllByOrganization(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'user_updated',
      payload: { fields: Object.keys(data) },
    });

    return user;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    const deletedUser = await this.prisma.user.delete({
      where: { id },
      select: { id: true, email: true, organizationId: true },
    });

    if (user) {
      await this.auditLog.log({
        organizationId: user.organizationId,
        userId: user.id,
        event: 'user_deleted',
        payload: { email: user.email },
      });
    }

    return deletedUser;
  }
}
