# Cockpit Backend — Guide de test de sécurité

> Document confidentiel destiné au auditeur de sécurité mandaté.
> Stack : NestJS v11 · TypeScript · Prisma v7 · PostgreSQL · Redis · Socket.io
> Version testée : MVP v1.1

---

## 1. Mise en place de l'environnement

### Prérequis

- Docker Desktop (recommandé) **ou** Node.js 20+ + PostgreSQL 16 + Redis 7
- Git
- Un client HTTP : [Bruno](https://www.usebruno.com/) / Postman / curl
- Un client WebSocket : [Postman WebSocket](https://www.postman.com/) ou `wscat`

### Démarrage rapide avec Docker

```bash
# 1. Cloner le repo
git clone <url-du-repo>
cd insightsage_backend

# 2. Copier l'environnement de test
cp .env.test .env

# 3. Démarrer PostgreSQL + Redis + pgAdmin
docker compose up -d

# 4. Installer les dépendances
npm install --legacy-peer-deps

# 5. Pousser le schéma DB (pas de migrations — db push)
npx prisma db push

# 6. Lancer le backend
npm run start:dev
```

Le backend écoute sur `http://localhost:3000`.

### Interfaces disponibles

| Interface | URL | Notes |
|---|---|---|
| API REST | `http://localhost:3000/api` | Préfixe global `/api` |
| Swagger UI | `http://localhost:3000/docs` | Protégé par JWT — voir §3 |
| pgAdmin | `http://localhost:5050` | admin@cockpit.io / cockpit_admin |
| PostgreSQL direct | `localhost:5432` | cockpit_user / cockpit_pass / db: cockpit |
| Redis | `localhost:6379` | Auth: cockpit_redis_pass |

---

## 2. Architecture de sécurité

### Guards globaux (s'appliquent à toutes les routes)

| Ordre | Guard | Rôle |
|---|---|---|
| 1 | `JwtAuthGuard` | Vérifie le JWT Bearer — route ignorée si `@Public()` |
| 2 | `TenantGuard` | Vérifie que `organizationId` du token correspond aux données accédées |

### Guards additionnels (décorateur explicite)

| Guard | Usage |
|---|---|
| `PermissionsGuard` | Vérifie les permissions RBAC (`action:resource`) |
| `SubscriptionGuard` | Vérifie que le plan de l'org inclut la feature demandée |

### Tokens JWT

| Type | Durée | Usage |
|---|---|---|
| Access token | 15 min | Authorization: Bearer <token> |
| Refresh token | 7 jours | POST /api/auth/refresh |
| Agent token | 30 jours | Format `isag_xxxxxxxxxx` (48 hex chars), WebSocket agents |

### RBAC — 5 rôles système

| Rôle | Niveau |
|---|---|
| `superadmin` | Bypass total via permission `manage:all` |
| `owner` | Propriétaire de l'organisation |
| `daf` | Directeur administratif et financier |
| `controller` | Contrôleur de gestion |
| `analyst` | Analyste (lecture seule) |

Permissions au format `action:resource` — ex: `read:dashboards`, `manage:users`.

---

## 3. Compte de test — bootstrapping

Aucun seed automatique n'est fourni. Créer un compte manuellement :

```bash
# Étape 1 — Créer le premier compte (rôle owner par défaut)
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"pentest@cockpit-test.local","password":"Pentest@2026!","firstName":"Pentest","lastName":"Auditor","organizationName":"PentestOrg"}'

# Étape 2 — Se connecter et récupérer les tokens
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pentest@cockpit-test.local","password":"Pentest@2026!"}'

# Réponse attendue : { "accessToken": "...", "refreshToken": "..." }
```

Swagger : accéder à `http://localhost:3000/docs` → entrer email + mot de passe dans la page de login Swagger, ou coller le JWT dans "Access token existant".

---

## 4. Cartographie complète des endpoints

### Routes publiques (sans JWT)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/auth/invitation-info?token=` | Info invitation |
| POST | `/api/auth/register` | Inscription via invitation |
| POST | `/api/auth/signup` | Inscription directe |
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/refresh` | Rafraîchir le JWT (RefreshGuard) |
| POST | `/api/auth/forgot-password` | Envoi email reset |
| POST | `/api/auth/reset-password` | Reset avec token |
| POST | `/api/agents/register` | Enregistrement d'un agent on-premise |
| POST | `/api/agents/heartbeat` | Heartbeat agent (token agent requis) |
| GET | `/api/subscriptions/plans` | Liste des plans tarifaires |
| GET | `/api/health` | Health check |

### Routes protégées — Auth module

| Méthode | Route | Permission requise |
|---|---|---|
| POST | `/api/auth/logout` | JWT valide |
| POST | `/api/auth/change-password` | JWT valide |
| POST | `/api/auth/invite` | `manage:invitations` |

### Routes protégées — Agents

| Méthode | Route | Permission requise |
|---|---|---|
| POST | `/api/agents/generate-token` | `manage:agents` |
| GET | `/api/agents/status` | `read:agents` |
| GET | `/api/agents/:id` | `read:agents` |
| POST | `/api/agents/:id/regenerate-token` | `manage:agents` |
| POST | `/api/agents/:id/revoke` | `manage:agents` |
| POST | `/api/agents/:id/test-connection` | `manage:agents` |
| POST | `/api/agents/query` | `read:agents` |
| GET | `/api/agents/:id/job-stats` | `read:agents` |
| GET | `/api/agents/:id/logs` | `read:agents` |
| GET | `/api/agents/:id/jobs` | `read:agents` |
| GET | `/api/agents/jobs/:jobId` | `read:agents` |

### Routes protégées — Admin (SuperAdmin uniquement)

| Méthode | Route |
|---|---|
| GET | `/api/admin/dashboard-stats` |
| POST | `/api/admin/clients` |
| GET/PATCH/DELETE | `/api/admin/organizations/:id` |
| GET/POST/PATCH/DELETE | `/api/admin/users/:id` |
| GET | `/api/admin/audit-logs` |
| GET | `/api/admin/invitations` |
| CRUD | `/api/admin/subscription-plans` |
| GET | `/api/admin/billing/subscriptions` |
| CRUD | `/api/admin/kpi-definitions` |
| CRUD | `/api/admin/widget-templates` |
| CRUD | `/api/admin/kpi-packs` |
| GET | `/api/admin/nlq-intents` |
| GET | `/api/admin/nlq-templates` |

### Autres routes protégées

| Module | Routes notables |
|---|---|
| Users | GET `/api/users/me`, PATCH `/api/users/me`, GET/PATCH/DELETE `/api/users/:id` |
| Organizations | GET/PATCH `/api/organizations/me` |
| Roles | CRUD `/api/roles`, GET `/api/roles/permissions` |
| Dashboards | CRUD `/api/dashboards`, POST/PATCH/DELETE `/api/dashboards/:id/widgets/:widgetId` |
| Widget Store | GET `/api/widget-store` |
| NLQ | POST `/api/nlq/query`, POST `/api/nlq/add-to-dashboard` (nécessite feature `hasNlq`) |
| Onboarding | GET `/api/onboarding/status`, POST `/api/onboarding/step1..5`, POST `/api/onboarding/agent-link` |
| Datasource | POST `/api/datasource/test-connection`, POST `/api/datasource/discover` |
| Logs | GET `/api/logs` |
| Subscriptions | GET `/api/subscriptions/plans` |

### WebSockets

| Namespace | Auth | Événements entrants | Événements sortants |
|---|---|---|---|
| `/agents` | Token agent (`isag_xxx`) dans `handshake.auth.token` | `sql_result`, `agent_log` | `execute_sql`, `authenticated` |
| `/cockpit` | JWT user dans `handshake.auth.token` | — | `agent_log` (relay) |

---

## 5. Périmètre de test recommandé

### 5.1 Authentification & Tokens

- [ ] Brute-force sur `/api/auth/login` — le rate limiter (ThrottlerGuard) intervient-il ?
- [ ] JWT avec signature invalide / algorithme `none` / alg confusion (HS256 → RS256)
- [ ] Refresh token réutilisable après logout ? (rotation token)
- [ ] Token de reset password réutilisable ou à durée illimitée ?
- [ ] Token d'invitation réutilisable plusieurs fois ?
- [ ] Access token encore valide après `logout` (pas de blacklist en mémoire) ?

### 5.2 Isolation multi-tenant (IDOR)

> Point critique — chaque donnée est scopée par `organizationId`.

- [ ] Accéder aux dashboards d'une autre organisation avec un JWT valide d'une org différente
- [ ] `GET /api/agents/:id` avec un `id` appartenant à une autre org
- [ ] `GET /api/users/:id` avec un `id` appartenant à une autre org
- [ ] `GET /api/admin/organizations/:id` accessible avec un compte non-superadmin ?
- [ ] `GET /api/logs` — les logs d'autres tenants sont-ils accessibles ?
- [ ] Jobs agents : `GET /api/agents/jobs/:jobId` — IDOR sur jobId ?

### 5.3 Escalade de privilèges (RBAC)

- [ ] Accéder à `/api/admin/*` avec un rôle `analyst` ou `daf`
- [ ] `POST /api/roles` avec un rôle non autorisé — créer un rôle custom avec `manage:all` ?
- [ ] `PATCH /api/users/:id` — un `analyst` peut-il modifier le rôle d'un autre utilisateur ?
- [ ] `POST /api/auth/invite` — inviter un utilisateur avec un rôle supérieur au sien ?
- [ ] Modifier son propre rôle via `PATCH /api/users/me` ?

### 5.4 Injection & Validation des entrées

- [ ] Injection SQL via NLQ : `POST /api/nlq/query` — la `SqlSecurityService` filtre uniquement les SELECT, blackliste les mots-clés dangereux (DROP, INSERT, UPDATE, DELETE, etc.) — tester les contournements (commentaires, encodage, UNION, sous-requêtes)
- [ ] Mass assignment : champs non autorisés dans les PATCH (ValidationPipe avec `whitelist: true` et `forbidNonWhitelisted: true` actifs)
- [ ] `POST /api/datasource/test-connection` — SSRF possible ? (host/port arbitraires)
- [ ] `POST /api/datasource/discover` — idem
- [ ] Injections dans les paramètres d'URL (`/api/agents/:id` avec des valeurs inhabituelles)
- [ ] Prototype pollution dans les body JSON

### 5.5 WebSocket — Namespace `/agents`

- [ ] Connexion au namespace `/agents` avec un JWT user (au lieu d'un token agent)
- [ ] Envoyer un `sql_result` avec un `jobId` appartenant à une autre organisation
- [ ] Envoyer un `agent_log` avec un `agentId` falsifié
- [ ] Injection de payload dans le champ `message` des logs agent
- [ ] Connexion avec un token agent révoqué — la déconnexion est-elle immédiate ?
- [ ] Un même token agent peut-il ouvrir plusieurs connexions simultanées ?

### 5.6 Swagger et exposition d'informations

- [ ] `/docs-json` ou `/docs-yaml` accessibles sans JWT ? (middleware de protection présent)
- [ ] Headers de réponse — information disclosure (X-Powered-By, stack trace)
- [ ] Messages d'erreur — révèlent-ils des détails internes (noms de tables, stack) ?
- [ ] `GET /api/health` — révèle-t-il des infos sur la version ou la config interne ?

### 5.7 Gestion des agents on-premise

- [ ] Token agent format `isag_xxxxxxxxxx` — entropie suffisante ?
- [ ] `POST /api/agents/heartbeat` sans token — réponse révèle-t-elle de l'info ?
- [ ] `POST /api/agents/register` — peut-on enregistrer un agent pour une org arbitraire ?
- [ ] Après révocation (`POST /api/agents/:id/revoke`), le token est-il immédiatement invalide en WebSocket ?
- [ ] `POST /api/agents/query` — peut-on envoyer une requête SQL arbitraire via ce endpoint ?

### 5.8 Audit logs & PII

- [ ] Les emails sont-ils bien masqués (j***@domain.com) dans les logs ?
- [ ] Les mots de passe sont-ils bien remplacés par [REDACTED] ?
- [ ] Un rôle non-admin peut-il accéder aux audit logs d'autres utilisateurs ?

### 5.9 Configuration & Headers

- [ ] CORS — tester une origine non listée, une origine null
- [ ] Helmet actif — vérifier les headers de sécurité (CSP, HSTS, X-Frame-Options)
- [ ] `scriptSrc: ["'self'", "'unsafe-inline'"]` dans le CSP — vecteur XSS résiduel ?
- [ ] Rate limiting (ThrottlerGuard) — présent globalement ou seulement sur certaines routes ?

---

## 6. Outils suggérés

| Outil | Usage |
|---|---|
| [Burp Suite Community](https://portswigger.net/burp) | Proxy HTTP, fuzzing, scanner |
| [OWASP ZAP](https://www.zaproxy.org/) | Scanner automatique |
| [wscat](https://github.com/websockets/wscat) | Tests WebSocket CLI |
| [jwt.io](https://jwt.io) | Décodage / analyse JWT |
| [sqlmap](https://sqlmap.org/) | Tests injection SQL (NLQ) |
| Bruno / Postman | Collections de requêtes manuelles |
| `redis-cli` | Inspection du cache Redis |

---

## 7. Ce qui est hors périmètre

- L'agent on-premise lui-même (composant externe, non fourni dans ce repo)
- L'infrastructure Supabase (base de données de production)
- Le frontend (repo séparé)
- Les services tiers (Flutterwave, Sentry) — non configurés en test

---

## 8. Livrable attendu

Un rapport structuré contenant pour chaque finding :

- **Titre** et **sévérité** (Critical / High / Medium / Low / Informational)
- **Description** du problème
- **Étapes de reproduction** (request/response)
- **Impact** métier
- **Recommandation** de correction

Format suggéré : Markdown ou PDF.

---

## 9. Contact

Pour toute question technique sur l'architecture pendant le test, contacter le développeur du backend directement.

---

*Document généré le 2026-04-07 — Cockpit Backend MVP v1.1*
