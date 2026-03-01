# PRD.md – InsightSage Backend

## Project Overview
**InsightSage** - Plateforme SaaS BI B2B sécurisée pour DAF/CFO avec architecture Zero-Copy + Agent On-Premise.

## Architecture
- **Stack**: NestJS (TypeScript) + PostgreSQL + Prisma 7
- **Auth**: JWT OAuth2 + Refresh Tokens
- **RBAC**: Guards globaux + Permissions granulaires

## User Personas
1. **DAF (Abdou)** - Utilisateur principal, interroge les KPIs financiers
2. **Admin Tech (Sokhna)** - Installe et monitore l'Agent Sage
3. **SuperAdmin** - Développeur InsightSage, accès total

## Core Requirements (Static)
- ✅ Multi-tenant strict (organizationId everywhere)
- ✅ Zero-Copy Data (aucune donnée ERP copiée)
- ✅ Agent On-Premise (credentials ERP locaux uniquement)
- ✅ RBAC complet avec permissions granulaires

## What's Been Implemented

### Session 1 - 28/02/2026
**RBAC Complet**
- Guards globaux: JwtAuthGuard, TenantGuard
- Guards spécifiques: RolesGuard, PermissionsGuard
- Décorateurs: @Public, @Roles, @RequirePermissions, @CurrentUser, @OrganizationId
- Module Audit Logs avec service centralisé
- Health checks (GET /api/health, /api/health/db)
- AdminJS Panel basique (auth uniquement - en attente Prisma 7 support)
- 16 permissions, 5 rôles système

### Déjà Implémenté (Avant session)
- Auth complète (login, register, refresh, logout, forgot/reset password)
- Invitation système
- Gestion Users (CRUD + isolation tenant)
- Gestion Roles (CRUD custom roles)
- Admin: Création client (POST /admin/clients)
- Prisma schema complet

## Prioritized Backlog

### P0 - MVP Critical
- [ ] Onboarding Wizard (5 étapes)
- [ ] Dashboards CRUD
- [ ] Widgets CRUD
- [ ] Agent Registration & Heartbeat
- [ ] NLQ Templates

### P1 - Important
- [ ] Widget Store
- [ ] KPI Packs DAF
- [ ] Agent Status Monitoring
- [ ] Export CSV

### P2 - Nice to Have
- [ ] AdminJS CRUD complet (attente @adminjs/prisma v6)
- [ ] Rate Limiting
- [ ] PII Masking
- [ ] Redis Cache

## Next Tasks
1. `POST /onboarding/step1-5` endpoints
2. `GET /dashboards/me` + CRUD
3. `POST /agents/register` + heartbeat
4. `POST /nlq/query` avec templates
