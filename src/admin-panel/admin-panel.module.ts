import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import AdminJS from 'adminjs';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

// Create a separate Prisma client for AdminJS
const prisma = new PrismaClient();

// Admin credentials from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@insightsage.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123!';

@Module({
  imports: [
    AdminModule.createAdminAsync({
      useFactory: async () => {
        return {
          adminJsOptions: {
            rootPath: '/admin',
            branding: {
              companyName: 'InsightSage Admin',
              logo: false,
              withMadeWithLove: false,
            },
            locale: {
              language: 'fr',
              translations: {
                labels: {
                  Organization: 'Organisations',
                  User: 'Utilisateurs',
                  Role: 'Rôles',
                  Permission: 'Permissions',
                  Dashboard: 'Tableaux de bord',
                  Widget: 'Widgets',
                  Agent: 'Agents Sage',
                  AuditLog: "Logs d'audit",
                  Invitation: 'Invitations',
                  NlqTemplate: 'Templates NLQ',
                },
              },
            },
            resources: [],
          },
          auth: {
            authenticate: async (email: string, password: string) => {
              // Check hardcoded admin first
              if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
                return { email: ADMIN_EMAIL, title: 'SuperAdmin' };
              }

              // Check against superadmin users in database
              try {
                const user = await prisma.user.findUnique({
                  where: { email },
                  include: {
                    userRoles: {
                      include: {
                        role: {
                          include: {
                            permissions: {
                              include: { permission: true },
                            },
                          },
                        },
                      },
                    },
                  },
                });

                if (!user) return null;

                // Check if user has superadmin role
                const isSuperAdmin = user.userRoles.some((ur) =>
                  ur.role.permissions.some(
                    (rp) =>
                      rp.permission.action === 'manage' &&
                      rp.permission.resource === 'all',
                  ),
                );

                if (!isSuperAdmin) return null;

                const isPasswordValid = await bcrypt.compare(
                  password,
                  user.passwordHash,
                );
                if (!isPasswordValid) return null;

                return { email: user.email, title: 'SuperAdmin' };
              } catch (error) {
                console.error('Admin auth error:', error);
                return null;
              }
            },
            cookieName: 'adminjs',
            cookiePassword:
              process.env.ADMIN_COOKIE_SECRET ||
              'super-secret-and-long-cookie-password-32chars',
          },
          sessionOptions: {
            resave: false,
            saveUninitialized: false,
            secret:
              process.env.ADMIN_SESSION_SECRET ||
              'super-secret-session-key-32chars!',
          },
        };
      },
    }),
  ],
})
export class AdminPanelModule {}
