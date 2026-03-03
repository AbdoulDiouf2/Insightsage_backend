# InsightSage Backend — API Cockpit

> Plateforme SaaS multi-tenant d'analyse de données ERP pour PME — Backend NestJS + Admin Cockpit React

[![NestJS](https://img.shields.io/badge/NestJS-v11-E0234E?logo=nestjs)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-v7.4.2-2D3748?logo=prisma)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql)](https://supabase.com/)

---

## Vue d'ensemble

**InsightSage** est une plateforme qui permet aux équipes financières (DAF, contrôleurs de gestion) d'interroger leurs données ERP **Sage** en langage naturel et de visualiser des tableaux de bord CFO personnalisés.

L'écosystème se compose de trois composants :

| Composant | Rôle | Dépôt |
|-----------|------|-------|
| **InsightSage API** (ce dépôt) | Backend NestJS — API REST, RBAC, multi-tenant | `Insightsage_backend/` |
| **Admin Cockpit** | Frontend React — tableau de bord de supervision | `admin-cockpit/` |
| **Agent On-Premise** | Pont Python/Docker — synchronisation Sage ERP | Déployé chez le client |

---

## Documentation

La documentation complète est disponible via MkDocs Material :

```bash
# Installer MkDocs Material (une seule fois)
pip install mkdocs-material

# Lancer le serveur local (hot reload)
mkdocs serve
# → http://localhost:8000
```

Sections couvertes : Architecture · API Reference · Sécurité · Base de données · Modules · Frontend · Agent · Guides fonctionnels · CI/CD · Déploiement.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | NestJS v11 (Node.js / TypeScript strict) |
| ORM | Prisma v7.4.2 + adaptateur `@prisma/adapter-pg` |
| Base de données | PostgreSQL — hébergé sur Supabase (pooling PgBouncer) |
| Auth | JWT Access (15 min) + Refresh (7 j) + Tokens agents (30 j) |
| Validation | `class-validator` + `class-transformer` |
| Logs | AuditLogService global — masquage PII automatique |
| Tests | Jest + couverture Istanbul |
| Docs | MkDocs Material 9.x |

---

## Architecture & modules

```
src/
├── auth/           # JWT, refresh, invitations, reset password
├── users/          # Profils, équipe (DAF)
├── organizations/  # Cycle de vie d'un tenant
├── agents/         # Tokens on-premise, heartbeat, révocation
├── onboarding/     # Wizard 5 étapes avec machine à états
├── roles/          # RBAC granulaire — rôles & permissions
├── logs/           # Audit logs paginés + masquage PII
├── dashboards/     # Cockpits CFO personnalisés
├── widgets/        # Widget Store + KPI Packs
├── nlq/            # Natural Language Querying → SQL sécurisé
├── subscriptions/  # Plans Startup / PME / Business / Enterprise
├── admin/          # SuperAdmin — CRUD clients, users, plans
├── health/         # Endpoint de disponibilité
└── prisma/         # PrismaService singleton
```

Guards globaux : `JwtAuthGuard` → `TenantGuard` (isolation multi-tenant stricte par `organizationId`).

---

## Installation locale

### Prérequis

- Node.js v20+
- PostgreSQL (ou compte Supabase)

### 1. Dépendances

```bash
npm install
```

### 2. Variables d'environnement

```bash
cp .env.example .env
# Remplir DATABASE_URL, DIRECT_URL, JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL
```

### 3. Base de données

```bash
# Pousser le schéma (pas de migrations — stratégie db push)
npx prisma db push

# Seed RBAC + plans d'abonnement
npx ts-node prisma/seed.ts
```

### 4. Démarrage

```bash
# Développement (hot reload)
npm run start:dev

# Build production
npm run build && npm run start:prod
```

L'API écoute sur `http://localhost:3000`.
Swagger disponible sur `http://localhost:3000/api`.

---

## Tests

```bash
npm run test          # Jest en mode watch
npm run test:cov      # Avec couverture Istanbul → coverage/
npm run test:e2e      # Tests end-to-end
```

---

## Sécurité

- **Multi-tenancy** : chaque requête Prisma filtre par `organizationId`
- **RBAC** : 5 rôles système (`superadmin`, `owner`, `daf`, `controller`, `analyst`) + permissions granulaires `action:resource` (ex: `read:dashboards`, `write:widgets`)
- **Dashboards & Widgets** : système complet de Cockpits CFO avec Widget Store, KPI Packs DAF, et personnalisation de layout JSON
- **PII** : emails et mots de passe masqués dans tous les audit logs (`j***@acme.com`, `[REDACTED]`)
- **Secrets** : `.env*` protégé par `.gitignore`, jamais commité

---

## Déploiement

Production via Docker Compose + Nginx + Supabase. Voir la documentation — section **Déploiement** et **CI/CD**.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Mainteneur

**Nafaka Tech** — Équipe InsightSage.
Ce projet est propriétaire (`UNLICENSED`).
