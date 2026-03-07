---
title: Démarrage rapide
description: Lancer la plateforme Cockpit en moins de 10 minutes
---

# Démarrage rapide

Ce guide vous permet de démarrer l'ensemble de la plateforme Cockpit sur votre machine locale en moins de 10 minutes.

## Prérequis

Vérifiez que les outils suivants sont installés :

```bash
node --version   # >= 20.x LTS
npm --version    # >= 10.x
git --version    # >= 2.x
```

!!! warning "Base de données"
    Un accès à une instance **PostgreSQL 14+** est requis.
    Le projet utilise [Supabase](https://supabase.com) en production.
    Localement, vous pouvez utiliser Docker :
    ```bash
    docker run -d --name pg-cockpit \
      -e POSTGRES_PASSWORD=cockpit \
      -e POSTGRES_DB=insightsage \
      -p 5432:5432 postgres:16
    ```

---

## 1. Backend — Cockpit API

### Cloner et installer

```bash
git clone https://github.com/Nafaka-tech/Insightsage_backend.git
cd Insightsage_backend
npm install
```

### Configurer l'environnement

Copiez le fichier d'exemple et renseignez vos valeurs :

```bash
cp .env.example .env.dev
```

Éditez `.env.dev` avec vos paramètres :

```env
# Base de données PostgreSQL
DATABASE_URL="postgresql://postgres:cockpit@localhost:5432/insightsage?schema=public"
DIRECT_URL="postgresql://postgres:cockpit@localhost:5432/insightsage"

# Runtime
PORT=3000
NODE_ENV=development

# Secrets JWT (générer avec : openssl rand -base64 64)
JWT_SECRET="votre-secret-jwt-tres-long-et-securise"
JWT_REFRESH_SECRET="votre-secret-refresh-jwt-different"

# URL du frontend
FRONTEND_URL="http://localhost:5173"

# AdminJS (optionnel)
ADMIN_EMAIL="admin@insightsage.com"
ADMIN_PASSWORD="Admin123!"
ADMIN_COOKIE_SECRET="cookie-secret-32-caracteres-minimum"
ADMIN_SESSION_SECRET="session-secret-32-caracteres-min!"
```

### Initialiser la base de données

```bash
# Pousser le schéma Prisma (sans migration — drift existant)
npx prisma db push

# Injecter les données initiales (rôles RBAC + 4 plans d'abonnement)
npx ts-node prisma/seed.ts
```

!!! success "Données seed créées"
    Le seed crée automatiquement :

    - 5 rôles système : `superadmin`, `owner`, `daf`, `controller`, `analyst`
    - Permissions granulaires (`read:users`, `manage:agents`, `manage:all`…)
    - 4 plans d'abonnement : Startup, PME, Business, Enterprise

### Démarrer le serveur

```bash
npm run start:dev
```

L'API est disponible sur `http://localhost:3000`.
La documentation **Swagger** est accessible à `http://localhost:3000/api`.

```
✓ NestJS application running on: http://localhost:3000
✓ Swagger UI: http://localhost:3000/api
```

---

## 2. Frontend — Admin Cockpit

### Cloner et installer

```bash
git clone https://github.com/Nafaka-tech/admin-cockpit.git
cd admin-cockpit
npm install
```

### Configurer l'environnement

```bash
# Créer le fichier d'env local
echo 'VITE_API_URL=http://localhost:3000/api' > .env.local
```

### Démarrer le serveur de développement

```bash
npm run dev
```

Le dashboard est accessible sur `http://localhost:5173`.

---

## 3. Premier login

!!! note "Compte SuperAdmin"
    Après le seed, il n'existe pas encore de compte admin. Vous devez en créer un
    en appelant l'endpoint d'enregistrement :

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@cockpit.local",
    "password": "Admin123!",
    "organizationName": "Cockpit Corp"
  }'
```

Puis accordez le rôle `superadmin` à cet utilisateur via Prisma Studio :

```bash
npx prisma studio
# Ouvrez http://localhost:5555
# Table UserRole → créez une entrée avec le roleId du rôle "superadmin"
```

Ou via l'API directement (si vous avez déjà un superadmin) :

```bash
POST /admin/users  →  body: { email, password, organizationId, roleIds: ["<superadmin-role-id>"] }
```

---

## 4. Vérification santé

```bash
# Vérifier que l'API répond
curl http://localhost:3000/health

# Réponse attendue
{ "status": "ok", "timestamp": "2026-03-02T..." }
```

---

## Résumé des URLs

| Service | URL locale | Description |
|---------|-----------|-------------|
| **Cockpit API** | `http://localhost:3000` | Backend REST |
| **Swagger UI** | `http://localhost:3000/api` | Documentation interactive |
| **Admin Cockpit** | `http://localhost:5173` | Dashboard frontend |
| **Prisma Studio** | `http://localhost:5555` | Explorateur de base de données |

## Scripts utiles

=== "Backend"
    ```bash
    npm run start:dev    # Hot reload
    npm run start:prod   # Production (nécessite npm run build)
    npm run build        # Compiler TypeScript → dist/
    npm run test         # Tests unitaires Jest
    npm run test:cov     # Couverture de tests
    npm run lint         # ESLint
    ```

=== "Frontend"
    ```bash
    npm run dev          # Serveur Vite HMR
    npm run build        # Build production (dist/)
    npm run preview      # Prévisualiser le build
    npm run test         # Tests Vitest (watch)
    npm run test:run     # Tests en une passe
    npm run test:coverage # Couverture Istanbul/V8
    npm run lint         # ESLint
    ```

=== "Base de données"
    ```bash
    npx prisma db push       # Synchroniser schema → DB (sans migration)
    npx prisma studio        # Interface graphique DB
    npx ts-node prisma/seed.ts  # Réinjecter les données seed
    npx prisma generate      # Régénérer le client Prisma
    ```

---

!!! tip "Étape suivante"
    Maintenant que la plateforme tourne, explorez l'[Architecture globale](architecture/overview.md)
    pour comprendre comment les composants s'articulent.
