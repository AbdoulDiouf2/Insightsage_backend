import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import AdminJS from 'adminjs';
import * as bcrypt from 'bcrypt';
import * as AdminJSPrisma from '@adminjs/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';

// Register adapter
AdminJS.registerAdapter({
  Resource: AdminJSPrisma.Resource,
  Database: AdminJSPrisma.Database,
});

// Admin credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@insightsage.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123!';

@Module({
  imports: [
    PrismaModule,
    AdminModule.createAdminAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: async (prisma: PrismaService) => {
        return {
          adminJsOptions: {
            rootPath: '/admin',
            databases: [prisma],
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
                  SeedData: 'Données de Seed',
                  UserRole: 'Rôles Utilisateurs',
                  RolePermission: 'Permissions Rôles',
                },
              },
            },
            resources: [
              // Identité
              { resource: { model: 'User', client: prisma }, options: { navigation: { name: 'Identité', icon: 'User' } } },
              { resource: { model: 'Role', client: prisma }, options: { navigation: { name: 'Identité', icon: 'Shield' } } },
              { resource: { model: 'Permission', client: prisma }, options: { navigation: { name: 'Identité', icon: 'Lock' } } },
              { resource: { model: 'UserRole', client: prisma }, options: { navigation: { name: 'Identité', icon: 'Users' } } },
              { resource: { model: 'RolePermission', client: prisma }, options: { navigation: { name: 'Identité', icon: 'Key' } } },
              { resource: { model: 'Invitation', client: prisma }, options: { navigation: { name: 'Identité', icon: 'Mail' } } },
              // Structure
              { resource: { model: 'Organization', client: prisma }, options: { navigation: { name: 'Structure', icon: 'Home' } } },
              { resource: { model: 'Agent', client: prisma }, options: { navigation: { name: 'Structure', icon: 'Cpu' } } },
              // Contenu
              { resource: { model: 'Dashboard', client: prisma }, options: { navigation: { name: 'Contenu', icon: 'Layout' } } },
              { resource: { model: 'Widget', client: prisma }, options: { navigation: { name: 'Contenu', icon: 'Grid' } } },
              { resource: { model: 'NlqTemplate', client: prisma }, options: { navigation: { name: 'Contenu', icon: 'MessageSquare' } } },
              // Système
              { resource: { model: 'AuditLog', client: prisma }, options: { navigation: { name: 'Système', icon: 'Activity' } } },
              { resource: { model: 'SeedData', client: prisma }, options: { navigation: { name: 'Système', icon: 'Database' } } },
            ],
          },

          auth: {
            authenticate: async (email: string, password: string) => {
              // Hardcoded superadmin
              if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
                return { email: ADMIN_EMAIL, title: 'SuperAdmin' };
              }

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

                const isSuperAdmin = user.userRoles.some((ur) =>
                  ur.role.permissions.some(
                    (rp) =>
                      rp.permission.action === 'manage' &&
                      rp.permission.resource === 'all',
                  ),
                );

                if (!isSuperAdmin) return null;

                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) return null;

                return { email: user.email, title: 'SuperAdmin' };
              } catch (err) {
                console.error('Admin auth error:', err);
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
export class AdminPanelModule { }