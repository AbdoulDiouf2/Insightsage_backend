---
title: Déploiement
description: Déploiement Docker en production — backend, frontend et base de données
---

# Déploiement

## Architecture de déploiement production

```mermaid
graph TB
    subgraph Internet
        USER["🌐 Navigateur\nAdmin Cockpit"]
        AGENT_EXT["🤖 Agent Client\n(On-Premise)"]
    end

    subgraph VPS ["🖥️ VPS / Cloud Server"]
        NGINX["🔒 Nginx\nSSL + Reverse Proxy\n:443"]
        subgraph Docker["Docker Compose"]
            API["⚙️ insightsage-api\n:3000"]
            FRONT["🎛️ admin-cockpit\n:80 (static)"]
        end
    end

    subgraph Supabase ["☁️ Supabase"]
        PG[("🗄️ PostgreSQL")]
    end

    USER --> NGINX
    AGENT_EXT --> NGINX
    NGINX --> API
    NGINX --> FRONT
    API --> PG
```

---

## Docker Compose Production

### `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  # ─────────────────────────────────────────────────────
  # Backend — InsightSage API
  # ─────────────────────────────────────────────────────
  api:
    build:
      context: ./Insightsage_backend
      dockerfile: Dockerfile
    image: nafakatech/insightsage-api:latest
    container_name: insightsage-api
    restart: unless-stopped

    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: ${DATABASE_URL}
      DIRECT_URL: ${DIRECT_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}

    ports:
      - "3000:3000"

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    volumes:
      - ./logs/api:/app/logs

  # ─────────────────────────────────────────────────────
  # Frontend — Admin Cockpit (build statique servi par Nginx)
  # ─────────────────────────────────────────────────────
  cockpit:
    build:
      context: ./admin-cockpit
      dockerfile: Dockerfile
    image: nafakatech/admin-cockpit:latest
    container_name: admin-cockpit
    restart: unless-stopped

    ports:
      - "80:80"

  # ─────────────────────────────────────────────────────
  # Nginx — Reverse Proxy + SSL
  # ─────────────────────────────────────────────────────
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    restart: unless-stopped

    ports:
      - "443:443"
      - "80:80"

    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro

    depends_on:
      - api
      - cockpit
```

---

## Dockerfiles

### Backend (`Insightsage_backend/Dockerfile`)

```dockerfile
# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# Stage 2 — Production
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Générer le client Prisma pour production
RUN npx prisma generate

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
```

### Frontend (`admin-cockpit/Dockerfile`)

```dockerfile
# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=https://api.cockpit.nafaka.tech/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2 — Serve statique
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Nginx frontend (`admin-cockpit/nginx.conf`)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — toutes les routes vers index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache agressif pour les assets Vite (hash dans le nom)
    location ~* \.(js|css|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Pas de cache pour index.html
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

---

## Configuration Nginx (Reverse Proxy SSL)

```nginx
# /nginx/nginx.conf

# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name api.cockpit.nafaka.tech cockpit.nafaka.tech;
    return 301 https://$host$request_uri;
}

# API
server {
    listen 443 ssl http2;
    server_name api.cockpit.nafaka.tech;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Content-Type-Options "nosniff";
    add_header X-Frame-Options "DENY";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    location / {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Admin Cockpit
server {
    listen 443 ssl http2;
    server_name cockpit.nafaka.tech;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://cockpit:80;
        proxy_set_header Host $host;
    }
}
```

---

## Variables d'environnement production (`.env.prod`)

```env
# Base de données Supabase (Transaction mode)
DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"

# JWT — Générer avec: openssl rand -base64 64
JWT_SECRET="secret-production-ultra-long-64-chars-min"
JWT_REFRESH_SECRET="refresh-secret-production-different-64-chars"

# Frontend
FRONTEND_URL="https://cockpit.nafaka.tech"

# Runtime
NODE_ENV=production
PORT=3000
```

---

## Déploiement initial

```bash
# 1. Cloner les deux repos sur le serveur
git clone https://github.com/Nafaka-tech/Insightsage_backend.git
git clone https://github.com/Nafaka-tech/admin-cockpit.git

# 2. Créer le .env.prod
cp Insightsage_backend/.env.example Insightsage_backend/.env.prod
nano Insightsage_backend/.env.prod  # Remplir les valeurs

# 3. Initialiser la DB (une seule fois)
cd Insightsage_backend
npm install
DATABASE_URL="..." npx prisma db push
DATABASE_URL="..." npx ts-node prisma/seed.ts

# 4. Lancer avec Docker Compose
docker compose -f docker-compose.prod.yml up -d --build

# 5. Vérifier la santé
docker ps
curl https://api.cockpit.nafaka.tech/health
```

---

## Mise à jour (Rolling update)

```bash
# Tirer les dernières modifications
git pull origin main

# Reconstruire et redéployer sans downtime
docker compose -f docker-compose.prod.yml up -d --build --no-deps api

# Si modification du schéma DB
docker compose exec api npx prisma db push

# Vérifier les logs
docker logs insightsage-api -f --tail 100
```

---

## Monitoring post-déploiement

```bash
# Santé de l'API
curl https://api.cockpit.nafaka.tech/health

# Logs en temps réel
docker logs insightsage-api -f

# Utilisation ressources
docker stats insightsage-api admin-cockpit

# Vérifier les agents connectés
curl -H "Authorization: Bearer TOKEN" \
  https://api.cockpit.nafaka.tech/api/agents/status
```
