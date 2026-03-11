---
title: Installation & Configuration
description: Guide complet d'installation du backend Cockpit API
---

# Installation & Configuration

## Prérequis système

| Outil | Version | Vérification |
|-------|---------|-------------|
| Node.js | ≥ 20.x LTS | `node --version` |
| npm | ≥ 10.x | `npm --version` |
| PostgreSQL | ≥ 14 | Via Supabase ou local |
| Git | ≥ 2.x | `git --version` |

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/Nafaka-tech/Insightsage_backend.git
cd Insightsage_backend
```

### 2. Installer les dépendances

```bash
npm install --legacy-peer-deps
```

!!! warning "Peer deps"
    Le flag `--legacy-peer-deps` est requis en raison d'un conflit de dépendances entre `@adminjs/prisma` (désactivé) et `@prisma/client v7`. Sans ce flag, npm refuse d'installer.

### 3. Configurer l'environnement

Le projet supporte trois fichiers d'environnement selon `NODE_ENV` :

| Fichier | Environnement | Usage |
|---------|--------------|-------|
| `.env.dev` | `development` (défaut) | Développement local |
| `.env.test` | `test` | Tests Jest |
| `.env.prod` | `production` | Déploiement prod |

```bash
cp .env.example .env.dev
```

---

## Variables d'environnement

### Référence complète

```env
# ============================================================
# BASE DE DONNÉES
# ============================================================

# URL de connexion principale (via PgBouncer pour Supabase)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?pgbouncer=true"

# URL directe (pour prisma db push / studio)
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DB"

# ============================================================
# SERVEUR
# ============================================================

PORT=3000
NODE_ENV=development   # development | test | production

# ============================================================
# REDIS — Rate limiting distribué + cache
# ============================================================

REDIS_URL="redis://localhost:6379"
# En production (Upstash) : rediss://default:<token>@<host>.upstash.io:6379

# ============================================================
# JWT — SÉCURITÉ
# Générer avec : openssl rand -base64 64
# ============================================================

JWT_SECRET="<generate: openssl rand -base64 64>"
JWT_REFRESH_SECRET="<generate: openssl rand -base64 64>"

# ============================================================
# FRONTEND
# ============================================================

# URL du frontend (CORS)
FRONTEND_URL="http://localhost:5173"

# ============================================================
# ADMINJS PANEL (optionnel)
# ============================================================

ADMIN_EMAIL="admin@cockpit.io"
ADMIN_PASSWORD="<define a strong password>"
ADMIN_COOKIE_SECRET="<generate: openssl rand -base64 32>"
ADMIN_SESSION_SECRET="<generate: openssl rand -base64 32>"

# ============================================================
# SMTP — EMAIL TRANSACTIONNEL
# Laisser vide en dev : fallback console.log automatique
# Renseigner en prod quand le client fournit ses accès SMTP
# ============================================================

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Cockpit <noreply@insightsage.io>"

# ============================================================
# SENTRY — Error monitoring (optionnel, laisser vide pour désactiver)
# ============================================================

SENTRY_DSN=

# ============================================================
# FLUTTERWAVE — Paiements & Abonnements
# Utiliser les clés TEST en dev, LIVE en production
# ============================================================

FLW_SECRET_KEY=
FLW_PUBLIC_KEY=
FLW_SECRET_HASH=
```

!!! info "Emails en développement"
    Si `SMTP_HOST` est vide, le `MailerService` ne lève pas d'erreur. Les liens d'email (reset password, invitation, welcome) sont loggés en console avec le préfixe `[DEV]`. Aucune configuration SMTP n'est requise pour développer.

!!! warning "Secrets en production"
    Ne commettez **jamais** vos fichiers `.env.*` dans Git.
    Utilisez des secrets d'environnement CI/CD (GitHub Secrets, Vault, etc.).

    Générer des secrets sécurisés :
    ```bash
    # Génère un secret de 64 octets encodé en base64
    openssl rand -base64 64
    ```

---

## Base de données

### Initialisation Supabase (recommandé)

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Récupérer les URLs dans **Project Settings → Database → Connection String**
3. Choisir le mode **Transaction** pour `DATABASE_URL` (compatible PgBouncer)
4. Choisir le mode **Direct** pour `DIRECT_URL`

### Pousser le schéma

```bash
# Synchronise schema.prisma → PostgreSQL (sans fichiers de migration)
npx prisma db push
```

!!! info "Pourquoi `db push` ?"
    Le projet utilise `prisma db push` plutôt que `prisma migrate dev` car la base de données
    Supabase contient un drift existant. `db push` applique les changements directement
    sans créer de fichiers de migration conflictuels.

### Injecter les données initiales (seed)

```bash
npx ts-node prisma/seed.ts
```

Le seed crée :

- **5 rôles système** : `superadmin`, `owner`, `daf`, `controller`, `analyst`
- **Permissions granulaires** : matrice `action:resource`
- **4 plans d'abonnement** : Startup, PME, Business, Enterprise

### Prisma Studio (explorateur visuel)

```bash
npx prisma studio
# → http://localhost:5555
```

### Régénérer le client Prisma

À exécuter après chaque modification de `schema.prisma` :

```bash
npx prisma generate
```

---

## Démarrer l'API

=== "Développement (hot reload)"
    ```bash
    npm run start:dev
    ```

=== "Debug"
    ```bash
    npm run start:debug
    # Ouvrir Chrome DevTools → chrome://inspect
    ```

=== "Production"
    ```bash
    npm run build
    npm run start:prod
    ```

### Vérification

```bash
curl http://localhost:3000/health
# { "status": "ok", "timestamp": "2026-03-02T..." }
```

**Swagger UI** : [http://localhost:3000/docs](http://localhost:3000/docs) (protégé par JWT — page de connexion affichée si non authentifié)

---

## Configuration NestJS

### `nest-cli.json`

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

### `tsconfig.json` (extrait)

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "ES2021",
    "outDir": "./dist",
    "baseUrl": "./"
  }
}
```

### Variables d'environnement chargées automatiquement

Le `ConfigModule` dans `app.module.ts` charge le bon `.env` selon `NODE_ENV` :

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath:
    process.env.NODE_ENV === 'test'
      ? '.env.test'
      : process.env.NODE_ENV === 'production'
        ? '.env.prod'
        : ['.env.dev', '.env'],
})
```

---

## Scripts NPM

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Démarrage hot reload (NestJS watch) |
| `npm run start:debug` | Debug avec inspecteur Node |
| `npm run start:prod` | Démarrage production (`dist/main.js`) |
| `npm run build` | Compilation TypeScript → `dist/` |
| `npm run test` | Tests unitaires Jest |
| `npm run test:watch` | Tests en mode watch |
| `npm run test:cov` | Couverture de tests |
| `npm run test:e2e` | Tests end-to-end |
| `npm run lint` | ESLint (avec auto-fix) |
| `npm run format` | Prettier (avec auto-fix) |

---

## Redis

Redis est utilisé pour le rate limiting distribué des requêtes SQL temps réel (par organisation) et le ThrottlerGuard global.

### Options de configuration

=== "Développement local (Docker)"
    ```bash
    docker run -d --name redis -p 6379:6379 redis:alpine
    # REDIS_URL=redis://localhost:6379
    ```

=== "Développement local (WSL2)"
    ```bash
    # Dans WSL2 :
    sudo apt install redis-server
    sudo service redis-server start
    # REDIS_URL=redis://localhost:6379
    ```

=== "Production (Upstash — recommandé)"
    1. Créer une base sur [console.upstash.com](https://console.upstash.com)
    2. Récupérer l'URL Redis avec TLS
    3. Définir dans `.env.prod` :
    ```env
    REDIS_URL="rediss://default:<token>@<host>.upstash.io:6379"
    ```

!!! tip "Fail-open"
    Si Redis est indisponible au démarrage ou en cours d'exécution, les requêtes ne sont **pas bloquées** — un warning est loggé. Le rate limiting SQL est désactivé temporairement mais le reste de l'API fonctionne normalement.

---

## Git Hooks (Husky)

Les hooks pre-commit sont configurés via **Husky** :

```bash
# Vérifier l'installation des hooks
ls .husky/
```

À chaque commit, Husky exécute automatiquement :
- ESLint sur les fichiers modifiés
- Prettier pour le formatage

!!! tip "Initialisation manuelle"
    Si les hooks ne s'exécutent pas :
    ```bash
    npm run prepare
    # Équivalent de : husky install
    ```
