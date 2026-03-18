import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

import { AuditLogService } from '../logs/audit-log.service';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) { }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findAllByOrganization(organizationId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [
          { isSystem: true }, // Return default system roles (DAF, Analyst...)
          { organizationId }, // And custom roles created by this specific enterprise
        ],
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async create(organizationId: string, userId: string, dto: CreateRoleDto) {
    // Basic validation to prevent duplicate names in the same organization
    const existingRole = await this.prisma.role.findFirst({
      where: { name: dto.name, organizationId },
    });
    if (existingRole)
      throw new BadRequestException(`A role named ${dto.name} already exists.`);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        isSystem: false,
        organizationId,
        permissions: {
          create: dto.permissionIds.map((id) => ({ permissionId: id })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'role_created',
      payload: { roleId: role.id, name: role.name },
    });

    return role;
  }

  async update(id: string, organizationId: string, userId: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found.');

    // Safety check
    if (role.isSystem)
      throw new ForbiddenException('Cannot modify system default roles.');
    if (role.organizationId !== organizationId)
      throw new ForbiddenException(
        'Cannot modify roles from other organizations.',
      );

    const updateData: Prisma.RoleUpdateInput = {
      name: dto.name,
      description: dto.description,
    };

    // If we're updating permissions, we wipe the old pivot records and recreate
    if (dto.permissionIds) {
      updateData.permissions = {
        deleteMany: {},
        create: dto.permissionIds.map((permId) => ({ permissionId: permId })),
      };
    }

    const updatedRole = await this.prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'role_updated',
      payload: { roleId: id, name: updatedRole.name },
    });

    return updatedRole;
  }

  async findOne(id: string, organizationId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) throw new NotFoundException('Role not found.');

    // Tenant isolation: system roles are global, custom roles belong to an org
    if (!role.isSystem && role.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied to this role.');
    }

    return role;
  }

  async remove(id: string, organizationId: string, userId: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found.');

    if (role.isSystem)
      throw new ForbiddenException('Cannot delete system default roles.');
    if (role.organizationId !== organizationId)
      throw new ForbiddenException(
        'Cannot delete roles from other organizations.',
      );

    const deletedRole = await this.prisma.role.delete({ where: { id } });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'role_deleted',
      payload: { roleId: id, name: role.name },
    });

    return deletedRole;
  }
}
