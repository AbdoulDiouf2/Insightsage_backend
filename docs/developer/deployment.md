---
title: Déploiement Production
description: Guide complet d'installation et de déploiement de la plateforme Cockpit en production — Windows Server, Docker Desktop, IIS, SSL et agent on-premise.
---

# Déploiement Production

!!! info "Environnement cible"
    Ce guide cible un déploiement sur **Windows Server 2022** avec **Docker Desktop** (backend via WSL2) et **IIS** comme reverse proxy SSL.

## Architecture cible

```mermaid
graph TB
    subgraph Internet["🌐 Internet"]
        USER["🖥️ Navigateur\nAdmin Cockpit"]
        AGENT_EXT["🤖 Agent Client\n(On-Premise Sage)"]
    end

    subgraph VPS["🪟 Windows Server 2022"]
        IIS["🔒 IIS\nSSL + Reverse Proxy\n:443 / :80"]
        subgraph Docker["🐳 Docker Desktop (WSL2)"]
            API["⚙️ insightsage-api\n:3000"]
            FRONT["🎛️ admin-cockpit\n:8080 static"]
            REDIS["🔴 Redis\n:6379"]
        end
    end

    subgraph Cloud["☁️ Services Cloud"]
        PG[("🗄️ Supabase\nPostgreSQL")]
        FLW["💳 Flutterwave\nPaiements"]
        SMTP["📧 SMTP\nEmails"]
        SENTRY["🐛 Sentry\nMonitoring"]
    end

    USER --> IIS
    AGENT_EXT --> IIS
    IIS --> API
    IIS --> FRONT
    API --> REDIS
    API --> PG
    API --> FLW
    API --> SMTP
    API -.-> SENTRY
```

---

## 1. Serveur Windows

### Configuration minimale recommandée

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| OS | Windows Server 2022 Standard | Windows Server 2022 Standard |
| vCPU | 4 | 8 |
| RAM | 8 Go | 16 Go |
| Disque système | 100 Go SSD | 200 Go SSD |
| Réseau | 100 Mbps | 1 Gbps |

!!! warning "RAM supplémentaire requise pour WSL2"
    Docker Desktop utilise WSL2 qui consomme environ 2-4 Go de RAM de base.
    Prévoir au minimum **8 Go** de RAM pour une installation correcte.

---

## 2. Installation des prérequis (PowerShell Administrateur)

!!! danger "Toutes les commandes suivantes doivent être exécutées dans PowerShell en tant qu'Administrateur"
    Clic droit → "Exécuter en tant qu'administrateur"

### 2.1 Activer WSL2 (Windows Subsystem for Linux)

WSL2 est requis par Docker Desktop pour exécuter les containers Linux.

```powershell
# Activer WSL et la plateforme de machine virtuelle
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Définir WSL2 comme version par défaut
wsl --set-default-version 2

# ⚠️ REDÉMARRER le serveur ici
Restart-Computer
```

Après le redémarrage, dans un nouveau PowerShell admin :

```powershell
# Mettre à jour le kernel WSL2 (si nécessaire)
wsl --update

# Installer Ubuntu 22.04 comme distribution WSL (utilisée par Docker)
wsl --install -d Ubuntu-22.04

# Vérifier
wsl --list --verbose
# Doit afficher : Ubuntu-22.04   Running   2
```

---

### 2.2 Docker Desktop for Windows

Télécharger **Docker Desktop for Windows** :
[download.docker.com/win/stable/Docker%20Desktop%20Installer.exe](https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe)

Installation silencieuse :
```powershell
# Télécharger et installer en mode silencieux
Invoke-WebRequest -Uri "https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe" `
  -OutFile "$env:TEMP\DockerDesktopInstaller.exe"

Start-Process "$env:TEMP\DockerDesktopInstaller.exe" `
  -ArgumentList "install --quiet --accept-license --backend=wsl-2" `
  -Wait
```

Après installation :

1. Lancer **Docker Desktop**
2. Aller dans **Settings → General** → cocher "Start Docker Desktop when you log in"
3. Aller dans **Settings → Resources → WSL Integration** → activer Ubuntu-22.04
4. Appliquer et redémarrer Docker

```powershell
# Vérifier dans PowerShell
docker --version          # Docker version 26.x.x
docker compose version    # Docker Compose version v2.x.x
docker run hello-world    # Test rapide
```

---

### 2.3 Git for Windows

```powershell
# Via winget
winget install Git.Git --silent

# Vérifier (ouvrir un nouveau terminal)
git --version   # git version 2.x.x
```

---

### 2.4 Node.js (pour le seed initial)

Node.js est nécessaire pour exécuter `prisma db push` et `seed.ts` en dehors des containers.

```powershell
# Installer Node.js 20 LTS via winget
winget install OpenJS.NodeJS.LTS --silent

# Vérifier (ouvrir un nouveau terminal)
node --version   # v20.x.x
npm --version    # 10.x.x
```

---

### 2.5 IIS (Internet Information Services)

IIS est le reverse proxy et la terminaison SSL sur Windows Server.

```powershell
# Installer IIS avec les modules essentiels
Install-WindowsFeature -Name Web-Server, Web-Default-Doc, Web-Http-Redirect, `
  Web-Http-Logging, Web-Stat-Compression, Web-Dyn-Compression, `
  Web-Filtering, Web-IP-Security, Web-Url-Auth, Web-Windows-Auth, `
  Web-Mgmt-Console, Web-Mgmt-Tools -IncludeManagementTools

# Vérifier
Get-Service W3SVC
iisreset /status
```

#### Module Application Request Routing (ARR) + URL Rewrite

Ces modules permettent à IIS de fonctionner comme reverse proxy.

```powershell
# Télécharger et installer URL Rewrite Module 2.1
Invoke-WebRequest -Uri "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi" `
  -OutFile "$env:TEMP\rewrite.msi"
Start-Process msiexec -ArgumentList "/i $env:TEMP\rewrite.msi /quiet" -Wait

# Télécharger et installer Application Request Routing 3.0
Invoke-WebRequest -Uri "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47AB-ABD7-217290059F11/requestRouter_amd64.msi" `
  -OutFile "$env:TEMP\arr.msi"
Start-Process msiexec -ArgumentList "/i $env:TEMP\arr.msi /quiet" -Wait

# Activer le proxy dans ARR (via PowerShell ou IIS Manager)
Import-Module WebAdministration
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' `
  -filter "system.webServer/proxy" -name "enabled" -value "True"
```

---

### 2.6 win-acme (Certificats SSL Let's Encrypt pour IIS)

```powershell
# Créer le répertoire
New-Item -ItemType Directory -Path "C:\Tools\win-acme" -Force

# Télécharger win-acme (remplacer par la dernière version sur github.com/win-acme/win-acme)
Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.x.x.x64.trimmed.zip" `
  -OutFile "$env:TEMP\win-acme.zip"

Expand-Archive "$env:TEMP\win-acme.zip" -DestinationPath "C:\Tools\win-acme" -Force

# Générer les certificats (interactif la première fois)
cd C:\Tools\win-acme
.\wacs.exe --target manual --host api.cockpit.nafaka.tech,cockpit.nafaka.tech `
  --installation iis --siteid 1 --emailaddress contact@nafaka.tech --accepttos
```

!!! tip "Renouvellement automatique"
    win-acme installe une tâche planifiée Windows qui renouvelle les certificats automatiquement.
    Vérifier dans le **Planificateur de tâches** → `win-acme renew`.

---

### 2.7 Firewall Windows

```powershell
# Autoriser HTTP et HTTPS en entrée
New-NetFirewallRule -DisplayName "HTTP (80)" -Direction Inbound `
  -Protocol TCP -LocalPort 80 -Action Allow

New-NetFirewallRule -DisplayName "HTTPS (443)" -Direction Inbound `
  -Protocol TCP -LocalPort 443 -Action Allow

# Bloquer l'accès direct aux containers depuis l'extérieur
# (les ports 3000, 6379, 8080 restent accessibles uniquement en local)
New-NetFirewallRule -DisplayName "Bloquer port 3000 public" -Direction Inbound `
  -Protocol TCP -LocalPort 3000 -RemoteAddress Internet -Action Block

New-NetFirewallRule -DisplayName "Bloquer port 6379 public" -Direction Inbound `
  -Protocol TCP -LocalPort 6379 -RemoteAddress Internet -Action Block

# Vérifier
Get-NetFirewallRule | Where-Object { $_.DisplayName -match "HTTP|HTTPS|3000|6379" } |
  Select-Object DisplayName, Action, Enabled
```

---

## 3. Services cloud requis

### 3.1 Supabase — PostgreSQL managé *(obligatoire)*

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **Settings → Database → Connection string**
3. Récupérer les deux URLs :

```env
# Transaction mode (PgBouncer, port 6543) — pour l'API en runtime
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (port 5432) — pour prisma db push / seed uniquement
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
```

| Plan Supabase | DB | Backups | Recommandé pour |
|---|---|---|---|
| Free | 500 Mo | Non | Développement / staging |
| Pro (25$/mois) | 8 Go | Quotidiens | **Production** |

---

### 3.2 Redis *(obligatoire — jobs asynchrones Bull)*

Redis tourne dans un container Docker. Aucun service Redis natif Windows n'est requis.

Inclus dans le `docker-compose.prod.yml` (voir section 4).

Variables à définir :
```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=motdepasseredisfort
```

---

### 3.3 Flutterwave — Paiements *(obligatoire)*

1. Compte sur [dashboard.flutterwave.com](https://dashboard.flutterwave.com)
2. Activer le mode **LIVE** (vérification KYB requise)
3. Aller dans **Settings → API Keys** → copier les clés LIVE
4. Configurer le webhook : `https://api.cockpit.nafaka.tech/api/billing/webhook`

```env
FLW_SECRET_KEY=FLWSECK_LIVE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
FLW_PUBLIC_KEY=FLWPUBK_LIVE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
FLW_SECRET_HASH=votre_hash_secret_webhook
```

---

### 3.4 SMTP — Emails transactionnels *(obligatoire)*

=== "Resend (recommandé)"

    [resend.com](https://resend.com) — 3 000 emails/mois gratuits.

    ```env
    SMTP_HOST=smtp.resend.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=resend
    SMTP_PASS=re_xxxxxxxxxxxxxxxx
    SMTP_FROM="Cockpit <noreply@cockpit.nafaka.tech>"
    ```

=== "Serveur SMTP client"

    Si le client fournit ses accès SMTP (Exchange, OVHcloud, etc.) :

    ```env
    SMTP_HOST=mail.acme.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=noreply@acme.com
    SMTP_PASS=MotDePasseSMTP
    SMTP_FROM="Cockpit <noreply@acme.com>"
    ```

!!! info "Mode dégradé sans SMTP"
    Si `SMTP_HOST` est vide, le mailer fait un `console.log` des emails (mode dev). Ne jamais laisser vide en production.

---

### 3.5 Sentry — Monitoring erreurs *(optionnel mais recommandé)*

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

---

### 3.6 Nom de domaine *(obligatoire)*

Configurer deux enregistrements **A** dans votre zone DNS :

| Sous-domaine | Type | Valeur | TTL |
|---|---|---|---|
| `api.cockpit.nafaka.tech` | A | IP publique du serveur | 300 |
| `cockpit.nafaka.tech` | A | IP publique du serveur | 300 |

---

## 4. Structure des fichiers sur le serveur

```
C:\Cockpit\
├── docker-compose.prod.yml
├── .env.prod
└── repos\
    ├── Insightsage_backend\    ← git clone
    └── admin-cockpit\          ← git clone
```

```powershell
# Créer la structure
New-Item -ItemType Directory -Path "C:\Cockpit\repos" -Force
cd C:\Cockpit

# Cloner les dépôts
git clone https://github.com/Nafaka-tech/Insightsage_backend.git repos\Insightsage_backend
git clone https://github.com/Nafaka-tech/admin-cockpit.git repos\admin-cockpit
```

---

## 5. Fichiers de configuration

### `C:\Cockpit\docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  # ─── Backend — InsightSage API ─────────────────────────────
  api:
    build:
      context: ./repos/Insightsage_backend
      dockerfile: Dockerfile
    image: nafakatech/insightsage-api:latest
    container_name: insightsage-api
    restart: unless-stopped
    env_file: .env.prod
    environment:
      NODE_ENV: production
      PORT: 3000
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    volumes:
      - C:/Cockpit/logs/api:/app/logs

  # ─── Frontend — Admin Cockpit (static Nginx) ───────────────
  cockpit:
    build:
      context: ./repos/admin-cockpit
      dockerfile: Dockerfile
      args:
        VITE_API_URL: https://api.cockpit.nafaka.tech/api
    image: nafakatech/admin-cockpit:latest
    container_name: admin-cockpit
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:80"

  # ─── Redis — Jobs asynchrones Bull ─────────────────────────
  redis:
    image: redis:7-alpine
    container_name: cockpit-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--pass", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis_data:
```

---

### Dockerfiles

=== "Backend (`repos/Insightsage_backend/Dockerfile`)"

    ```dockerfile
    # Stage 1 — Build
    FROM node:20-alpine AS builder
    WORKDIR /app

    COPY package*.json ./
    RUN npm ci --legacy-peer-deps

    COPY . .
    RUN npm run build

    # Stage 2 — Production
    FROM node:20-alpine AS production
    WORKDIR /app

    ENV NODE_ENV=production

    COPY package*.json ./
    RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force

    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/prisma ./prisma

    RUN npx prisma generate

    EXPOSE 3000

    HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
      CMD curl -f http://localhost:3000/health || exit 1

    CMD ["node", "dist/main"]
    ```

=== "Frontend (`repos/admin-cockpit/Dockerfile`)"

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

    # Stage 2 — Servir en statique
    FROM nginx:alpine AS production
    COPY --from=builder /app/dist /usr/share/nginx/html
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    EXPOSE 80
    CMD ["nginx", "-g", "daemon off;"]
    ```

=== "Nginx frontend (`repos/admin-cockpit/nginx.conf`)"

    ```nginx
    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location ~* \.(js|css|png|jpg|ico|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        location = /index.html {
            add_header Cache-Control "no-cache";
        }
    }
    ```

---

### Variables d'environnement (`C:\Cockpit\.env.prod`)

```env
# ── Base de données Supabase ──────────────────────────────────
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"

# ── NestJS ────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000

# ── JWT — générer avec: [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
JWT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
JWT_REFRESH_SECRET="yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

# ── Frontend ──────────────────────────────────────────────────
FRONTEND_URL="https://cockpit.nafaka.tech"

# ── Redis ─────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD="motdepasseredisfort"

# ── SMTP ──────────────────────────────────────────────────────
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxx
SMTP_FROM="Cockpit <noreply@cockpit.nafaka.tech>"

# ── Flutterwave ───────────────────────────────────────────────
FLW_SECRET_KEY=FLWSECK_LIVE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
FLW_PUBLIC_KEY=FLWPUBK_LIVE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
FLW_SECRET_HASH=votre_hash_secret_webhook

# ── Sentry (optionnel) ────────────────────────────────────────
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

!!! danger "Protection du fichier `.env.prod`"
    ```powershell
    # Restreindre l'accès au seul compte Administrateur
    $acl = Get-Acl "C:\Cockpit\.env.prod"
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "FullControl", "Allow"
    )
    $acl.AddAccessRule($rule)
    Set-Acl "C:\Cockpit\.env.prod" $acl
    ```

---

### Configuration IIS — Reverse Proxy

#### `web.config` pour le site `api.cockpit.nafaka.tech`

Créer `C:\inetpub\wwwroot\api\web.config` :

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Redirection HTTP → HTTPS -->
        <rule name="HTTP to HTTPS" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:0}"
                  redirectType="Permanent" />
        </rule>

        <!-- Proxy vers l'API NestJS (avec support WebSocket) -->
        <rule name="Proxy to API" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="ON" />
          </conditions>
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>

    <!-- Security headers -->
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
        <add name="Strict-Transport-Security"
             value="max-age=31536000; includeSubDomains" />
      </customHeaders>
    </httpProtocol>

    <!-- Support WebSocket (Socket.io pour les agents) -->
    <webSocket enabled="true" />
  </system.webServer>
</configuration>
```

#### `web.config` pour le site `cockpit.nafaka.tech` (SPA React)

Créer `C:\inetpub\wwwroot\cockpit\web.config` :

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Redirection HTTP → HTTPS -->
        <rule name="HTTP to HTTPS" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:0}"
                  redirectType="Permanent" />
        </rule>

        <!-- Proxy vers le container Nginx du cockpit -->
        <rule name="Proxy to Cockpit" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="ON" />
          </conditions>
          <action type="Rewrite" url="http://localhost:8080/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

#### Créer les deux sites IIS (PowerShell)

```powershell
Import-Module WebAdministration

# Créer les répertoires racine
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\api" -Force
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\cockpit" -Force

# Site API
New-Website -Name "cockpit-api" `
  -PhysicalPath "C:\inetpub\wwwroot\api" `
  -Port 443 `
  -HostHeader "api.cockpit.nafaka.tech" `
  -Ssl

# Site Frontend
New-Website -Name "cockpit-frontend" `
  -PhysicalPath "C:\inetpub\wwwroot\cockpit" `
  -Port 443 `
  -HostHeader "cockpit.nafaka.tech" `
  -Ssl

# Lier les certificats SSL générés par win-acme
# (win-acme le fait automatiquement, mais en cas de besoin manuel :)
# netsh http add sslcert hostnameport=api.cockpit.nafaka.tech:443 certhash=THUMBPRINT appid={GUID}
```

---

## 6. Déploiement initial

Toutes les commandes suivantes sont exécutées dans **PowerShell Administrateur** depuis `C:\Cockpit`.

```powershell
cd C:\Cockpit

# ── Étape 1 : Configurer les variables d'environnement ────────
Copy-Item "repos\Insightsage_backend\.env.example" ".env.prod"
notepad .env.prod   # Remplir toutes les valeurs

# ── Étape 2 : Générer les secrets JWT ─────────────────────────
# Exécuter deux fois et copier chaque résultat dans .env.prod
[System.Convert]::ToBase64String(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
)
# → coller le résultat dans JWT_SECRET
# → re-exécuter et coller dans JWT_REFRESH_SECRET

# ── Étape 3 : Générer les certificats SSL (win-acme) ──────────
cd C:\Tools\win-acme
.\wacs.exe --target manual `
  --host "api.cockpit.nafaka.tech,cockpit.nafaka.tech" `
  --installation iis `
  --emailaddress contact@nafaka.tech `
  --accepttos
cd C:\Cockpit

# ── Étape 4 : Initialiser la base de données (une seule fois) ─
cd repos\Insightsage_backend
npm install --legacy-peer-deps
$env:DATABASE_URL = (Get-Content C:\Cockpit\.env.prod | Select-String "^DIRECT_URL=(.*)").Matches.Groups[1].Value.Trim('"')
npx prisma db push
npx ts-node -r tsconfig-paths/register prisma/seed.ts
cd C:\Cockpit

# ── Étape 5 : Builder et démarrer les containers ──────────────
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# ── Étape 6 : Vérifier l'état des containers ──────────────────
docker ps
# Tous les containers doivent être en état "healthy"

# ── Étape 7 : Tester l'API ────────────────────────────────────
Invoke-RestMethod -Uri "http://localhost:3000/health"
# Puis via HTTPS après configuration IIS :
Invoke-RestMethod -Uri "https://api.cockpit.nafaka.tech/health"
```

Sortie attendue du seed :
```
✅ Permissions seeded.
✅ Roles & RolePermissions seeded.
✅ Subscription plans seeded.
⚠️  Deduplicated 12 duplicate KPI keys from kpi-bis.json
📊 Seeding 114 KPIs and NLQ data...
✅ KPI Definitions & NLQ seeded.
✅ Widget Templates seeded. (8 types)
✅ KPI Packs seeded. (12 packs)
✅ Seed completed.
```

!!! warning "`--legacy-peer-deps` obligatoire"
    Conflit de dépendances entre `@adminjs/prisma` et `@prisma/client` v7.
    Sans ce flag, `npm install` échoue.

---

## 7. Démarrage automatique des containers (redémarrage Windows)

Docker Desktop sur Windows Server peut ne pas redémarrer automatiquement les containers après un reboot. Créer une tâche planifiée :

```powershell
# Créer un script de démarrage
$scriptContent = @'
Start-Sleep -Seconds 30   # Attendre que Docker soit prêt
cd C:\Cockpit
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
'@
$scriptContent | Out-File "C:\Cockpit\start-containers.ps1" -Encoding UTF8

# Créer la tâche planifiée (au démarrage du système, compte SYSTEM)
$action = New-ScheduledTaskAction `
  -Execute "PowerShell.exe" `
  -Argument "-NonInteractive -File C:\Cockpit\start-containers.ps1"

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName "CockpitDockerStart" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Description "Démarre les containers Docker Cockpit au démarrage"

# Vérifier
Get-ScheduledTask -TaskName "CockpitDockerStart"
```

---

## 8. Mises à jour (Rolling update)

```powershell
cd C:\Cockpit

# 1. Tirer les dernières modifications
cd repos\Insightsage_backend; git pull origin main; cd C:\Cockpit
cd repos\admin-cockpit; git pull origin main; cd C:\Cockpit

# 2. Reconstruire et redéployer l'API sans downtime
docker compose -f docker-compose.prod.yml --env-file .env.prod `
  up -d --build --no-deps api

# 3. Si modification du schéma DB
docker compose -f docker-compose.prod.yml exec api npx prisma db push

# 4. Vérifier les logs
docker logs insightsage-api -f --tail 100
```

---

## 9. Monitoring

```powershell
# Santé de l'API
Invoke-RestMethod -Uri "https://api.cockpit.nafaka.tech/health"

# Logs en temps réel
docker logs insightsage-api -f
docker logs cockpit-redis -f

# Utilisation ressources des containers
docker stats insightsage-api admin-cockpit cockpit-redis

# Agents connectés
$token = "votre_access_token"
Invoke-RestMethod -Uri "https://api.cockpit.nafaka.tech/api/agents/status" `
  -Headers @{ Authorization = "Bearer $token" }
```

---

## 10. Agent On-Premise (chez le client final)

Pour chaque client abonné utilisant Sage 100 en local, l'agent doit être installé **sur leur serveur ERP** (pas sur le serveur de déploiement Nafaka).

### Prérequis côté client

| Composant | Version | Notes |
|-----------|---------|-------|
| OS | Windows 10/11 Pro ou Server 2016+ | Ou Linux |
| Python | ≥ 3.11 | Si installation native |
| Docker | ≥ 20.x | Si installation Docker |
| ODBC Driver | **Microsoft ODBC Driver 17** for SQL Server | Obligatoire |
| SQL Server | Instance Sage 100 accessible | Compte lecture seule requis |
| Réseau | Port **443 sortant** uniquement | Vers `api.cockpit.nafaka.tech` |

### Créer le compte SQL Server lecture seule

```sql
-- Sur l'instance SQL Server Sage 100 du client
CREATE LOGIN cockpit_agent WITH PASSWORD = 'MotDePasseComplexe!2026';
USE SAGE_PROD;
CREATE USER cockpit_agent FOR LOGIN cockpit_agent;
GRANT SELECT ON SCHEMA::dbo TO cockpit_agent;
-- NE PAS accorder INSERT, UPDATE, DELETE, EXECUTE
```

### Installer ODBC Driver 17 (Windows client)

Télécharger depuis Microsoft :
→ [Microsoft ODBC Driver 17 for SQL Server](https://learn.microsoft.com/fr-fr/sql/connect/odbc/download-odbc-driver-for-sql-server)

```powershell
# Vérifier l'installation
Get-OdbcDriver -Name "ODBC Driver 17 for SQL Server"
```

### Installer l'agent

=== "Python — Windows Service (recommandé)"

    ```powershell
    # 1. Installer Python 3.11+
    winget install Python.Python.3.11

    # 2. Cloner l'agent
    git clone https://github.com/Nafaka-tech/cockpit-agent.git
    cd cockpit-agent

    # 3. Dépendances
    pip install -r requirements.txt
    pip install pywin32

    # 4. Configurer .env (token depuis Admin Cockpit → Agents → Générer token)
    Copy-Item .env.example .env
    notepad .env
    ```

    Contenu du `.env` :
    ```env
    AGENT_TOKEN=isag_votre_token_ici
    API_BASE_URL=https://api.cockpit.nafaka.tech/api
    SQL_SERVER=localhost\SAGE_INSTANCE
    SQL_DATABASE=SAGE_PROD
    SQL_USERNAME=cockpit_agent
    SQL_PASSWORD=MotDePasseComplexe!2026
    SQL_DRIVER=ODBC Driver 17 for SQL Server
    SYNC_INTERVAL_MINUTES=15
    HEARTBEAT_INTERVAL_SECONDS=30
    LOG_LEVEL=INFO
    ```

    ```powershell
    # 5. Tester la connexion
    python main.py --test

    # 6. Installer comme service Windows (démarrage automatique)
    python service.py install
    net start CockpitAgent

    # Vérifier
    sc query CockpitAgent
    ```

=== "Docker"

    ```yaml
    # docker-compose.yml (côté client)
    version: '3.8'

    services:
      cockpit-agent:
        image: nafakatech/cockpit-agent:latest
        container_name: cockpit-agent-prod
        restart: unless-stopped
        environment:
          - AGENT_TOKEN=isag_votre_token_ici
          - API_BASE_URL=https://api.cockpit.nafaka.tech/api
          - SQL_SERVER=host.docker.internal\SAGE_INSTANCE
          - SQL_DATABASE=SAGE_PROD
          - SQL_USERNAME=cockpit_agent
          - SQL_PASSWORD=MotDePasseComplexe!2026
          - SQL_DRIVER=ODBC Driver 17 for SQL Server
          - SYNC_INTERVAL_MINUTES=15
          - HEARTBEAT_INTERVAL_SECONDS=30
        volumes:
          - ./logs:/app/logs
        extra_hosts:
          - "host.docker.internal:host-gateway"
    ```

    ```powershell
    docker compose up -d
    docker logs cockpit-agent-prod -f
    ```

### Vérification post-installation agent

Dans **Admin Cockpit → Agents** :

- [ ] L'agent apparaît avec le statut `online` (vert) dans les 30 secondes
- [ ] `lastSeen` se met à jour toutes les 30 secondes
- [ ] `rowsSynced` augmente après le premier cycle de sync

!!! warning "Renouvellement du token (tous les 30 jours)"
    1. Admin Cockpit → **Agents → Régénérer le token**
    2. Mettre à jour `AGENT_TOKEN` dans `.env`
    3. `net restart CockpitAgent` (service Windows) ou `docker compose restart`

---

## 11. Checklist finale avant mise en production

### Serveur Windows

- [ ] Windows Server 2022 Standard (ou Datacenter)
- [ ] WSL2 activé (`wsl --list --verbose` → Ubuntu-22.04 Running 2)
- [ ] Docker Desktop installé et opérationnel (`docker run hello-world`)
- [ ] Docker Desktop configuré pour démarrer avec Windows
- [ ] Git for Windows installé
- [ ] Node.js 20 LTS installé
- [ ] IIS installé avec modules ARR + URL Rewrite
- [ ] Firewall Windows configuré (80 et 443 autorisés, 3000/6379 bloqués depuis Internet)

### SSL et domaines

- [ ] Enregistrements DNS A configurés vers l'IP du serveur
- [ ] win-acme installé
- [ ] Certificats SSL générés pour `api.cockpit.nafaka.tech` et `cockpit.nafaka.tech`
- [ ] Renouvellement automatique testé (tâche planifiée win-acme présente)
- [ ] Sites IIS créés avec les `web.config` de reverse proxy

### Services cloud

- [ ] Projet Supabase créé, `DATABASE_URL` et `DIRECT_URL` récupérés
- [ ] Compte SMTP actif, envoi de test validé
- [ ] Compte Flutterwave LIVE activé, webhook configuré et `FLW_SECRET_HASH` cohérent
- [ ] Sentry DSN configuré (optionnel)

### Application

- [ ] Fichier `C:\Cockpit\.env.prod` complet (aucune variable critique vide)
- [ ] `JWT_SECRET` et `JWT_REFRESH_SECRET` générés (64 bytes en base64, valeurs différentes)
- [ ] `npx prisma db push` exécuté (schéma synchronisé)
- [ ] Seed exécuté avec succès :
    - 114 KPIs uniques
    - 12 KPI Packs
    - 8 Widget Templates
    - Rôles, permissions, plans d'abonnement en place
- [ ] Tâche planifiée `CockpitDockerStart` créée (redémarrage auto après reboot)
- [ ] Tous les containers en état `healthy` (`docker ps`)
- [ ] `GET https://api.cockpit.nafaka.tech/health` → `200 OK`
- [ ] Swagger accessible sur `https://api.cockpit.nafaka.tech/api`
- [ ] Connexion Admin Cockpit fonctionnelle (login superadmin)

### Agent client

- [ ] ODBC Driver 17 installé sur le serveur Sage du client
- [ ] Compte SQL Server lecture seule créé (`GRANT SELECT ON SCHEMA::dbo`)
- [ ] Token agent généré depuis Admin Cockpit et configuré dans `.env`
- [ ] `python main.py --test` → tous les tests passés
- [ ] Service Windows `CockpitAgent` démarré (`sc query CockpitAgent` → `RUNNING`)
- [ ] Agent visible `online` dans Admin Cockpit dans les 30 secondes

---

## 12. Résumé des versions clés

| Technologie | Version | Rôle |
|-------------|---------|------|
| Windows Server | 2022 Standard | Système hôte |
| WSL2 | 2.x | Noyau Linux pour Docker |
| Docker Desktop | ≥ 4.x (Engine 26.x) | Runtime containers |
| Docker Compose | v2.x (intégré) | Orchestration |
| Node.js (container) | 20 LTS Alpine | Runtime NestJS |
| Node.js (hôte) | 20 LTS | Seed / Prisma CLI |
| IIS | 10.x | Reverse proxy + SSL |
| win-acme | 2.2.x | Certificats Let's Encrypt |
| PostgreSQL | 15 via Supabase | Base de données |
| Redis | 7 Alpine (container) | File de jobs Bull |
| Python (agent) | ≥ 3.11 | Agent on-premise |
| ODBC Driver | 17 | Connexion SQL Server Sage 100 |
