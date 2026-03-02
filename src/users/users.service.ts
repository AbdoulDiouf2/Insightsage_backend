import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../logs/audit-log.service';

// Champs sensibles jamais retournés dans les réponses API (Section 2.3 - PII Masking)
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  emailVerified: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  // Exclus : passwordHash, hashedRefreshToken, resetPasswordToken, resetPasswordExpires
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Recherche par email (usage interne auth uniquement — retourne le hash du mot de passe)
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Recherche par ID (usage interne auth uniquement — retourne les tokens hachés)
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Recherche par ID sans champs sensibles — utilisé par JWT strategy, guards, controllers
   * Ne retourne jamais : passwordHash, hashedRefreshToken, resetPasswordToken, resetPasswordExpires
   */
  async findByIdSafe(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        userRoles: {
          select: {
            id: true,
            roleId: true,
            createdAt: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                organizationId: true,
                permissions: {
                  select: {
                    id: true,
                    roleId: true,
                    permissionId: true,
                    permission: {
                      select: {
                        id: true,
                        action: true,
                        resource: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Liste tous les utilisateurs d'une organisation sans champs sensibles
   */
  async findAllByOrganization(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        ...SAFE_USER_SELECT,
        userRoles: {
          select: {
            id: true,
            roleId: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  /**
   * Met à jour un utilisateur et retourne un profil sans champs sensibles
   */
  async update(id: string, data: Prisma.UserUpdateInput) {
    // Exécuter la mise à jour (peut inclure des champs sensibles comme hashedRefreshToken)
    await this.prisma.user.update({ where: { id }, data });

    // Retourner le profil nettoyé
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        userRoles: {
          select: {
            id: true,
            roleId: true,
            role: {
              select: { id: true, name: true, description: true },
            },
          },
        },
      },
    });

    if (user) {
      await this.auditLog.log({
        organizationId: user.organizationId,
        userId: user.id,
        event: 'user_updated',
        payload: { fields: Object.keys(data) },
      });
    }

    return user;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    const deletedUser = await this.prisma.user.delete({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (user) {
      await this.auditLog.log({
        organizationId: user.organizationId,
        userId: user.id,
        event: 'user_deleted',
        payload: { userId: user.id },
      });
    }

    return deletedUser;
  }
}
