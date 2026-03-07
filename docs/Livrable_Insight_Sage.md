# Documentation Technique Stack Backend – Nafaka / InsightSage MVP

*Documentation officielle du back-end pour le développement du MVP SaaS BI. Dernière mise à jour : 27/02/2026. Projet confidentiel – NDA requis.*

## 1. Aperçu technique

**Stack principale : Nest.js (TypeScript) + PostgreSQL + Prisma**

| Composant | Technologie | Version cible | Raisonnement |
|-----------|-------------|---------------|--------------|
| Framework Backend | Nest.js | ^10.x | Modularité native, guards RBAC, OpenAPI auto, écosystème riche |
| Base de données | PostgreSQL | 16.x | Relations complexes, JSONB pour layouts, multi-tenant |
| ORM | Prisma | ^5.x | Migrations, relations, performances |
| Auth & Sécurité | JWT + Passport | - | Isolation multi-tenant stricte, architecture Zero-Copy Data |
| Data Agent | FastAPI / pyodbc | - | Agent On-Prem autonome (géré par Data Engineer) |

## 2. Structure du projet

```
insightsage-backend/
├── src/
│   ├── app.module.ts           # Module racine
│   ├── main.ts                 # Bootstrap app
│   ├── common/                 # Utilitaires partagés
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── pipes/
│   ├── modules/                # Modules par domaine métier
│   │   ├── auth/
│   │   ├── users/
│   │   ├── organizations/
│   │   ├── onboarding/
│   │   ├── dashboards/
│   │   ├── widgets/
│   │   ├── nlq/
│   │   ├── logs/
│   │   └── admin/
│   └── config/                 # Configuration env
├── prisma/
│   ├── schema.prisma          # Modèles DB
│   └── migrations/
├── docker/
│   └── Dockerfile
├── docs/
│   └── LIVRABLES.md           # Cette doc
├── .env.example
├── .gitignore
├── README.md
└── package.json
```

## 3. Installation & démarrage

### Prérequis
```bash
Node.js 20.x+
PostgreSQL 16.x (local ou Supabase)
Docker (optionnel)
pnpm (recommandé)
```

### Installation complète
```bash
# 1. Cloner et installer
git clone <repo> insightsage-backend
cd insightsage-backend
pnpm install

# 2. Configurer DB
cp .env.example .env
# Éditer .env avec tes creds PostgreSQL
npx prisma generate
npx prisma db push

# 3. Seeder (optionnel)
pnpm run seed:dev

# 4. Lancer
pnpm run start:dev    # Hot reload
# ou
pnpm run start:prod   # Production
```

### Environnements
```
NODE_ENV=development
DATABASE_URL="postgresql://user:pass@localhost:5432/insightsage"
JWT_SECRET="super-secret-key-change-me"
FRONTEND_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"
```

## 4. Modules fonctionnels

### 4.1 Authentification & RBAC
```
modules/auth/
├── auth.controller.ts      # POST /auth/login, /auth/register
├── auth.service.ts         # Login logic, JWT generation
├── auth.module.ts
├── dto/
│   ├── login.dto.ts
│   └── register.dto.ts
├── guards/
│   └── jwt-auth.guard.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── local.strategy.ts
└── entities/
    └── user.entity.ts
```

**Endpoints clés :**
- `POST /auth/login` → `{ access_token, refresh_token }`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me` (protégé JWT)

### 4.2 Onboarding (5 étapes)
```
modules/onboarding/
├── onboarding.controller.ts
├── onboarding.service.ts
└── dto/
    ├── step1-plan.dto.ts    # Choix abonnement
    ├── step2-org.dto.ts     # Création orga
    ├── step3-datasource.dto.ts
    ├── step4-profiles.dto.ts
    └── step5-invites.dto.ts
```

### 4.3 Dashboards & Widgets
```
modules/dashboards/
├── dashboards.controller.ts  # GET /dashboards/me
├── widgets.controller.ts     # POST /dashboards/:id/widgets
└── entities/
    ├── dashboard.entity.ts
    └── widget.entity.ts      # JSON layout, filters
```

## 5. Modélisation données (Prisma)

**schema.prisma** (extrait principal) :
```prisma
model Organization {
  id          String   @id @default(uuid())
  name        String
  sector      String?
  size        String   // "startup" | "pme" | "business" | "enterprise"
  plan        String   @default("pme") // plan abonnement
  sageType    String?  // "X3" | "100"
  sageHost    String?
  sagePort    Int?
  sageConfig  Json?    // mapping Sage tables → métriques (AUCUN CREDENTIAL)
  users       User[]
  dashboards  Dashboard[]
  createdAt   DateTime @default(now())
}

model User {
  id             String        @id @default(uuid())
  email          String        @unique
  password       String        // bcrypt
  firstName      String?
  lastName       String?
  role           Role          @default(USER)
  profile        Profile?      // DAF, DG, etc.
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id])
  dashboards     Dashboard[]
}

model Dashboard {
  id             String   @id @default(uuid())
  name           String
  ownerId        String
  organizationId String
  layout         Json     // positions widgets
  widgets        Widget[]
}
```

## 6. Sécurité implémentée

### Guards RBAC
```typescript
// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Logique vérification rôle utilisateur
  }
}
```

### Isolation multi-tenant
- **Toutes** les queries filtrées par `organizationId`
- Guard global `TenantGuard` sur `app.module`
- Tests unitaires isolation données

## 7. API Documentation (Swagger)

**Auto-générée** sur `GET /api` :

```
Authentification
├── POST /auth/login
├── POST /auth/refresh
└── POST /auth/logout

Onboarding
├── POST /onboarding/step1
├── POST /onboarding/step2
└── POST /onboarding/step3

Dashboards
├── GET  /dashboards/me
├── POST /dashboards
└── POST /dashboards/{id}/widgets

NLQ & Store
├── POST /agents/register
├── GET  /admin/agent-status/:organizationId
├── GET  /admin/nlq-intents
├── GET  /admin/nlq-templates
├── POST /nlq/query
└── POST /nlq/add-to-dashboard
```

## 8. Monitoring & Audit Logs

### Logs structurés (Winston)
```
modules/logs/
├── audit-log.service.ts
└── entities/audit-log.entity.ts
```

**Events tracés :**
- Connexions/déconnexions
- Création/modification dashboards
- Requêtes NLQ
- Changements rôles

### Health checks
```
GET /health          # Status global
GET /health/db       # DB connection
GET /health/redis    # Cache
```

## 9. Déploiement

### Docker (prod)
```dockerfile
# docker/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
CMD ["pnpm", "start:prod"]
```

### Railway/Render
```
DATABASE_URL → PostgreSQL service
REDIS_URL → Redis service
JWT_SECRET → Variable d'env
```

## 10. Scripts utiles

```bash
# Seeder dev
pnpm run seed:dev

# Tests
pnpm run test          # Unitaires
pnpm run test:e2e      # E2E API

# Docs
pnpm run docs:build    # Swagger + README

# Prisma Studio (DB GUI)
npx prisma studio
```

## 11. Conventions & Bonnes pratiques

✅ **Faites :**
- 1 fichier entité par table Prisma
- DTOs validés `class-validator`
- Guards sur TOUS les endpoints sensibles
- Logs structurés JSON

❌ **À éviter ABSOLUMENT :**
- **Stocker des credentials ERP (Sécurité majeure)**
- Autoriser la génération SQL libre (NLQ)
- Hardcoded secrets
- Queries SQL raw
- Sans `organizationId` filter

## 12. Roadmap évolutions

| Phase | Fonctionnalités | Durée estimée |
|-------|-----------------|---------------|
| MVP | Auth + Onboarding + Cockpit DAF | 30 jours |
| V2 | Multi-profils + Widget Store complet | 3 semaines |
| V3 | Connecteurs marketing + LLMs NLQ | 6 semaines |

***

**Cette documentation couvre 100% du périmètre Phase 1-5 du devis DEV-2025-0007.**

*Copie-colle directement dans `docs/LIVRABLES.md` de ton repo Git.*