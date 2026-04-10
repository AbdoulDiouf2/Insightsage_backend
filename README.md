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
| Cache / Rate Limiting | Redis (`node-redis` v5) — rate limiting distribué SQL + ThrottlerGuard |
| Validation | `class-validator` + `class-transformer` |
| Sécurité | Helmet (CSP) + bcrypt ×12 + SHA-256 token hashing + `timingSafeEqual` |
| Logs | AuditLogService global — masquage PII automatique + alertes admin `ERROR_ALERT_EVENTS` |
| Monitoring | Sentry (conditionnel via `SENTRY_DSN`) |
| Stockage | Cloudflare R2 (S3) avec fallback local FS-Extra |
| Docs | MkDocs Material 9.x |

---

## Architecture & modules

```
src/
├── bugs/           # Ticketing technique & Signalement bug (BR-YYYYMMDD-XXX)
├── storage/        # Service hybride Cloudflare R2 / S3 / Local FS
├── auth/           # JWT, refresh, invitations, reset password
├── users/          # Profils, équipe (DAF)
├── organizations/  # Cycle de vie d'un tenant
├── agents/         # Tokens on-premise, heartbeat, révocation
├── onboarding/     # Wizard 5 étapes avec machine à états
├── roles/          # RBAC granulaire — rôles & permissions
├── logs/           # Audit logs paginés + masquage PII + alertes erreur
├── notifications/  # Alertes email admin — newOrg, agentOffline, paiements, erreurs
├── dashboards/     # Cockpits CFO personnalisés
├── widgets/        # Widget Store + KPI Packs
├── nlq/            # Natural Language Querying → SQL sécurisé
├── subscriptions/  # Plans Startup / PME / Business / Enterprise
├── admin/          # SuperAdmin — CRUD clients, users, plans, NLQ Store, SystemConfig
├── health/         # Endpoint de disponibilité
└── prisma/         # PrismaService singleton
```

Guards globaux : `JwtAuthGuard` → `TenantGuard` (isolation multi-tenant stricte par `organizationId`).

---

## Notifications admin

Le `NotificationsModule` envoie des alertes email aux administrateurs désignés lors d'événements système critiques :

| Événement | Déclencheur |
|-----------|-------------|
| Nouvelle organisation | Signup public ou création via SuperAdmin |
| Agent hors ligne | Absence de heartbeat > 2 minutes |
| Paiement échoué | Webhook Flutterwave `charge.failed` |
| Paiement réussi | Webhook Flutterwave `charge.completed` |
| Erreur système | Tout événement `agent_error`, `agent_job_timeout`, `agent_token_expired` |

Les préférences (activation par type + liste de destinataires) se configurent depuis **Paramètres → Général → Notifications** dans l'Admin Cockpit et sont persistées dans le singleton `SystemConfig` (`GET/PATCH /admin/system-config`).

---

## Installation locale

### Prérequis

- Node.js v20+
- PostgreSQL (ou compte Supabase)

### 1. Dépendances

```bash
npm install --legacy-peer-deps
```

### 2. Variables d'environnement

```bash
cp .env.example .env.dev
# Remplir : DATABASE_URL, DIRECT_URL, JWT_SECRET, JWT_REFRESH_SECRET, REDIS_URL, FRONTEND_URL
# Optionnel : SMTP_*, SENTRY_DSN, FLW_*
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

L'API écoute sur `http://localhost:3000/api`.
Swagger (protégé JWT) : `http://localhost:3000/docs`.

---

## Tests

```bash
npm run test          # Jest en mode watch
npm run test:cov      # Avec couverture Istanbul → coverage/
npm run test:e2e      # Tests end-to-end
```

---

## Sécurité

- **Helmet + CSP** : Headers de sécurité HTTP avec Content Security Policy stricte.
- **JWT protégé** : Swagger UI (`/docs`) protégé par JWT — page de connexion si non authentifié.
- **bcrypt ×12** : Mots de passe et refresh tokens hashés avec le facteur OWASP recommandé.
- **SHA-256 tokens** : Tokens d'invitation et reset password stockés hashés en DB (jamais en clair).
- **CORS strict** : Whitelist d'origines explicite, aucune origine `null` autorisée.
- **Rate Limiting Redis** : 10 req/min par organisation sur les requêtes SQL temps réel (distribué).
- **timingSafeEqual** : Vérification des webhooks Flutterwave en temps constant (anti-timing attacks).
- **Audit Log & PII** : Emails et mots de passe masqués automatiquement (`j***@acme.com`).
- **SQL Sandboxing** : Validation stricte des requêtes NLQ (`SELECT` uniquement, whitelist de tables).
- **Isolation Tenant** : Filtrage immuable par `organizationId` au niveau Guard + ORM + tunnel WebSocket.
- **Sentry** : Monitoring d'erreurs en production (désactivé si `SENTRY_DSN` vide).
- **Secrets** : `.env*` protégé par `.gitignore`, jamais commité.

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
