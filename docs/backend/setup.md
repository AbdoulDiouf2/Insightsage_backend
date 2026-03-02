---
title: Installation & Configuration
description: Guide complet d'installation du backend InsightSage API
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
npm install
```

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
# JWT — SÉCURITÉ
# Générer avec : openssl rand -base64 64
# ============================================================

JWT_SECRET="votre-secret-jwt-tres-long-minimum-32-chars"
JWT_REFRESH_SECRET="votre-secret-refresh-different-du-jwt"

# ============================================================
# FRONTEND
# ============================================================

# URL du frontend (CORS)
FRONTEND_URL="http://localhost:5173"

# ============================================================
# ADMINJS PANEL (optionnel)
# ============================================================

ADMIN_EMAIL="admin@insightsage.com"
ADMIN_PASSWORD="Admin123!"
ADMIN_COOKIE_SECRET="cookie-secret-minimum-32-caracteres!!"
ADMIN_SESSION_SECRET="session-secret-minimum-32-caracteres!"
```

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

**Swagger UI** : [http://localhost:3000/api](http://localhost:3000/api)

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
