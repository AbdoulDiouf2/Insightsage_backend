---
title: CI/CD — GitHub Actions
description: Pipelines d'intégration et de déploiement continus
---

# CI/CD — GitHub Actions

## Vue d'ensemble des pipelines

```mermaid
graph LR
    PUSH["git push\n(feature branch)"] --> CI["CI Pipeline\n(build + lint + test)"]
    CI -->|"✅ Pass"| PR["Pull Request\nreview"]
    PR -->|"✅ Merged to develop"| INT["Integration\n(deploy staging)"]
    INT -->|"✅ QA validé"| MAIN["Merge to main"]
    MAIN --> PROD["Production Deploy\n(docker build + push + deploy)"]

    CI -->|"❌ Fail"| BLOCK["PR bloquée"]

    style CI fill:#0f3d3d,stroke:#0d9488,color:#2dd4bf
    style PROD fill:#064e3b,stroke:#22c55e,color:#22c55e
    style BLOCK fill:#450a0a,stroke:#dc2626,color:#fca5a5
```

---

## Pipeline CI — Backend

### `.github/workflows/ci-backend.yml`

```yaml
name: CI — InsightSage Backend

on:
  push:
    branches: [develop, main]
    paths:
      - 'Insightsage_backend/**'
      - '.github/workflows/ci-backend.yml'
  pull_request:
    branches: [develop, main]

defaults:
  run:
    working-directory: Insightsage_backend

jobs:
  # ─────────────────────────────────────────────────────
  # Job 1: Lint + Type Check
  # ─────────────────────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: Insightsage_backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check Prettier formatting
        run: npm run format -- --check

      - name: TypeScript type check
        run: npx tsc --noEmit

  # ─────────────────────────────────────────────────────
  # Job 2: Tests unitaires
  # ─────────────────────────────────────────────────────
  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: Insightsage_backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:cov
        env:
          DATABASE_URL: "postgresql://test:test@localhost:5432/insightsage_test"
          JWT_SECRET: "test-secret-for-ci-only"
          JWT_REFRESH_SECRET: "test-refresh-secret-for-ci-only"
          NODE_ENV: test

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          directory: Insightsage_backend/coverage
          flags: backend

  # ─────────────────────────────────────────────────────
  # Job 3: Build Docker image
  # ─────────────────────────────────────────────────────
  build:
    name: Docker Build
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: Insightsage_backend
          push: true
          tags: |
            nafakatech/insightsage-api:latest
            nafakatech/insightsage-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Pipeline CI — Frontend

### `.github/workflows/ci-frontend.yml`

```yaml
name: CI — Admin Cockpit

on:
  push:
    branches: [develop, main]
    paths:
      - 'admin-cockpit/**'
  pull_request:
    branches: [develop, main]

defaults:
  run:
    working-directory: admin-cockpit

jobs:
  lint-test:
    name: Lint, Type Check & Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: admin-cockpit/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: ESLint
        run: npm run lint

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Run Vitest
        run: npm run test:run

      - name: Vitest Coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          directory: admin-cockpit/coverage
          flags: frontend

  build:
    name: Vite Build
    runs-on: ubuntu-latest
    needs: lint-test
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: admin-cockpit/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build production
        run: npm run build
        env:
          VITE_API_URL: https://api.cockpit.nafaka.tech/api

      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: admin-cockpit
          push: true
          tags: nafakatech/admin-cockpit:latest
          build-args: |
            VITE_API_URL=https://api.cockpit.nafaka.tech/api
```

---

## Pipeline CD — Déploiement Production

### `.github/workflows/deploy-prod.yml`

```yaml
name: Deploy — Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/cockpit

            # Pull des dernières images
            docker compose -f docker-compose.prod.yml pull

            # Redémarrage sans downtime (rolling update)
            docker compose -f docker-compose.prod.yml up -d --no-deps api cockpit

            # Migration DB si nécessaire
            docker compose -f docker-compose.prod.yml exec -T api \
              npx prisma db push --accept-data-loss

            # Nettoyage des anciennes images
            docker image prune -f

            # Vérification santé
            sleep 15
            curl -f http://localhost:3000/health || exit 1

            echo "✅ Déploiement production réussi"
```

---

## Secrets GitHub requis

| Secret | Description | Exemple |
|--------|-------------|---------|
| `DOCKERHUB_USERNAME` | Login Docker Hub | `nafakatech` |
| `DOCKERHUB_TOKEN` | Token Docker Hub | `dckr_pat_xxx` |
| `PROD_HOST` | IP/domaine du serveur | `195.x.x.x` |
| `PROD_USER` | Utilisateur SSH | `deploy` |
| `PROD_SSH_KEY` | Clé privée SSH (PEM) | `-----BEGIN RSA...` |

Pour configurer : `GitHub Repo → Settings → Secrets and variables → Actions → New repository secret`

---

## Build de la documentation (MkDocs)

### `.github/workflows/docs.yml`

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]
    paths:
      - 'Insightsage_backend/docs/**'
      - 'Insightsage_backend/mkdocs.yml'

jobs:
  docs:
    name: Build & Deploy MkDocs
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install MkDocs + Material
        run: |
          pip install mkdocs-material
          pip install mkdocs-mermaid2-plugin

      - name: Build documentation
        run: mkdocs build --strict
        working-directory: Insightsage_backend

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: Insightsage_backend/site
          destination_dir: docs
```

---

## Lancer la doc localement

```bash
# Installer MkDocs Material
pip install mkdocs-material

# Serveur de développement (hot reload)
cd Insightsage_backend
mkdocs serve
# → http://localhost:8000

# Build production
mkdocs build
# → site/ dossier prêt à déployer

# Vérifier les liens
mkdocs build --strict
```

!!! tip "Vérification des liens"
    L'option `--strict` fait échouer le build si des liens internes sont brisés
    ou si des avertissements sont présents. Utilisez-la dans le CI pour garantir l'intégrité.
