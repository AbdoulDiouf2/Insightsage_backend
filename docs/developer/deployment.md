---
title: Déploiement Production
description: Guide complet d'installation et de déploiement de la plateforme Cockpit en production — Windows Server, Docker Desktop, Nginx + SSL Let's Encrypt, agent on-premise.
---

# Déploiement Production

!!! info "Environnement cible"
    Ce guide cible un déploiement sur **Windows Server 2022** avec **Docker Desktop** (WSL2) et **Nginx** comme reverse proxy SSL (tout dans Docker).

## Architecture cible

```mermaid
graph TB
    subgraph Internet["🌐 Internet"]
        USER["🖥️ Navigateur DAF\ncockpit.nafaka.tech"]
        AGENT_EXT["🤖 Agent Client\nOn-Premise Sage"]
        CERTBOT_CA["🔒 Let's Encrypt\nCA"]
    end

    subgraph VPS["🪟 Windows Server 2022"]
        subgraph Docker["🐳 Docker Desktop (WSL2)"]
            NGINX["🔀 Nginx\n:80 → :443 SSL"]
            CERTBOT["📜 Certbot\nRenouvellement auto"]
            API["⚙️ cockpit_api\n:3000 interne"]
            FRONT["🎛️ cockpit_frontend\n:80 interne"]
            PG[("🗄️ cockpit_postgres\n:5432 interne")]
            REDIS["🔴 cockpit_redis\n:6379 interne"]
        end
    end

    subgraph Cloud["☁️ Services Cloud"]
        SMTP["📧 SMTP Client"]
        SENTRY["🐛 Sentry (optionnel)"]
    end

    USER --> NGINX
    AGENT_EXT --> NGINX
    CERTBOT_CA <-.->|ACME challenge| NGINX
    CERTBOT -.->|renouvelle| CERTBOT_CA
    NGINX --> API
    NGINX --> FRONT
    API --> PG
    API --> REDIS
    API --> SMTP
    API -.-> SENTRY
```

---

## 1. Configuration minimale du serveur

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| OS | Windows Server 2022 Standard | Windows Server 2022 Standard |
| vCPU | 4 | 8 |
| RAM | 8 Go | 16 Go |
| Disque | 100 Go SSD | 200 Go SSD |
| Réseau | 100 Mbps | 1 Gbps |

!!! warning "RAM pour WSL2"
    Docker Desktop utilise WSL2 qui consomme ~2-4 Go de RAM. Prévoir **8 Go minimum**.

---

## 2. Installation des prérequis (PowerShell Administrateur)

!!! danger "Toutes les commandes doivent être exécutées dans PowerShell en tant qu'Administrateur"

### 2.1 Activer WSL2

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --set-default-version 2

# ⚠️ REDÉMARRER ici
Restart-Computer
```

Après redémarrage :

```powershell
wsl --update
wsl --install -d Ubuntu-22.04
wsl --list --verbose
# Ubuntu-22.04   Running   2
```

### 2.2 Docker Desktop for Windows

```powershell
Invoke-WebRequest -Uri "https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe" `
  -OutFile "$env:TEMP\DockerDesktopInstaller.exe"

Start-Process "$env:TEMP\DockerDesktopInstaller.exe" `
  -ArgumentList "install --quiet --accept-license --backend=wsl-2" -Wait
```

Après installation :

1. Lancer **Docker Desktop**
2. **Settings → General** → cocher "Start Docker Desktop when you log in"
3. **Settings → Resources → WSL Integration** → activer Ubuntu-22.04

```powershell
docker --version         # Docker version 26.x.x
docker compose version   # Docker Compose version v2.x.x
docker run hello-world
```

### 2.3 Git for Windows

```powershell
winget install Git.Git --silent
git --version
```

### 2.4 Node.js (pour Prisma CLI et seed)

```powershell
winget install OpenJS.NodeJS.LTS --silent
node --version   # v20.x.x
```

### 2.5 Firewall Windows

```powershell
# Autoriser HTTP et HTTPS (requis pour Let's Encrypt + accès utilisateurs)
New-NetFirewallRule -DisplayName "HTTP (80)"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "HTTPS (443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Bloquer l'accès direct aux containers depuis l'extérieur
New-NetFirewallRule -DisplayName "Bloquer 3000 public" -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress Internet -Action Block
New-NetFirewallRule -DisplayName "Bloquer 5432 public" -Direction Inbound -Protocol TCP -LocalPort 5432 -RemoteAddress Internet -Action Block
New-NetFirewallRule -DisplayName "Bloquer 6379 public" -Direction Inbound -Protocol TCP -LocalPort 6379 -RemoteAddress Internet -Action Block
```

---

## 3. Services requis

### 3.1 SMTP — Emails transactionnels

=== "Serveur SMTP client (recommandé)"

    Si le client fournit ses accès SMTP (Exchange, OVHcloud, etc.) :

    ```env
    SMTP_HOST=mail.acme.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=noreply@acme.com
    SMTP_PASS=MotDePasseSMTP
    SMTP_FROM="Cockpit <noreply@acme.com>"
    ```

=== "Resend (fallback)"

    [resend.com](https://resend.com) — 3 000 emails/mois gratuits.

    ```env
    SMTP_HOST=smtp.resend.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=resend
    SMTP_PASS=re_xxxxxxxxxxxxxxxx
    SMTP_FROM="Cockpit <noreply@cockpit.nafaka.tech>"
    ```

!!! info "Mode dégradé sans SMTP"
    Si `SMTP_HOST` est vide, le mailer fait un `console.log` des emails. Ne jamais laisser vide en production.

### 3.2 Sentry — Monitoring erreurs *(optionnel)*

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### 3.3 Nom de domaine

Configurer un enregistrement **A** dans votre zone DNS :

| Sous-domaine | Type | Valeur | TTL |
|---|---|---|---|
| `cockpit.nafaka.tech` | A | IP publique du serveur | 300 |

!!! warning "DNS propagation"
    Attendre que le DNS soit propagé (max 1h) avant de générer les certificats SSL.

---

## 4. Structure des fichiers sur le serveur

```
C:\Cockpit\
└── repos\
    ├── insightsage_backend\    ← git clone (contient docker-compose.prod.yml)
    └── Client-cockpit\         ← git clone
```

```powershell
New-Item -ItemType Directory -Path "C:\Cockpit\repos" -Force
cd C:\Cockpit\repos

git clone https://github.com/Nafaka-tech/Insightsage_backend.git insightsage_backend
git clone https://github.com/Nafaka-tech/admin-cockpit.git Client-cockpit
```

---

## 5. Fichier de configuration `.env.prod`

Créer `C:\Cockpit\repos\insightsage_backend\.env.prod` :

```env
# ── Application ───────────────────────────────────────────────
NODE_ENV=production
PORT=3000
DOMAIN=cockpit.nafaka.tech
FRONTEND_URL=https://cockpit.nafaka.tech

# ── JWT — générer avec PowerShell :
# [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_REFRESH_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

# ── PostgreSQL ─────────────────────────────────────────────────
POSTGRES_DB=cockpit
POSTGRES_USER=cockpit_user
POSTGRES_PASSWORD=MotDePassePostgresComplexe!2026

DATABASE_URL=postgresql://cockpit_user:MotDePassePostgresComplexe!2026@postgres:5432/cockpit
DIRECT_URL=postgresql://cockpit_user:MotDePassePostgresComplexe!2026@postgres:5432/cockpit

# ── Redis ──────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=MotDePasseRedisComplexe!2026

# ── SMTP ───────────────────────────────────────────────────────
SMTP_HOST=mail.acme.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@acme.com
SMTP_PASS=MotDePasseSMTP
SMTP_FROM="Cockpit <noreply@acme.com>"

# ── Sentry (optionnel) ─────────────────────────────────────────
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

!!! danger "Sécuriser `.env.prod`"
    ```powershell
    $acl = Get-Acl "C:\Cockpit\repos\insightsage_backend\.env.prod"
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "FullControl", "Allow"
    )
    $acl.AddAccessRule($rule)
    Set-Acl "C:\Cockpit\repos\insightsage_backend\.env.prod" $acl
    ```

---

## 6. Déploiement initial

Toutes les commandes depuis `C:\Cockpit\repos\insightsage_backend\` en **PowerShell Administrateur**.

### Étape 1 — Configurer `.env.prod`

```powershell
cd C:\Cockpit\repos\insightsage_backend

Copy-Item .env.example .env.prod
notepad .env.prod   # Remplir toutes les valeurs
```

### Étape 2 — Générer les secrets JWT

```powershell
# Exécuter deux fois, une pour JWT_SECRET, une pour JWT_REFRESH_SECRET
[System.Convert]::ToBase64String(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
)
```

### Étape 3 — Démarrer Nginx en HTTP seul (pour Let's Encrypt)

Avant la génération des certificats SSL, Nginx doit tourner en HTTP pour répondre au challenge ACME.

```powershell
# Démarrer uniquement Nginx et Certbot (sans SSL encore)
docker compose -f docker-compose.prod.yml up -d nginx certbot
```

### Étape 4 — Générer les certificats SSL (Let's Encrypt)

```powershell
# Remplacer cockpit.nafaka.tech et contact@nafaka.tech par les vraies valeurs
docker compose -f docker-compose.prod.yml run --rm certbot certonly `
  --webroot -w /var/www/certbot `
  -d cockpit.nafaka.tech `
  --email contact@nafaka.tech `
  --agree-tos `
  --no-eff-email
```

Vérifier que les certs sont générés :

```powershell
docker compose -f docker-compose.prod.yml exec certbot `
  ls /etc/letsencrypt/live/cockpit.nafaka.tech/
# fullchain.pem  privkey.pem  cert.pem  chain.pem
```

### Étape 5 — Initialiser la base de données

```powershell
cd C:\Cockpit\repos\insightsage_backend

npm install --legacy-peer-deps

# Lire DATABASE_URL depuis .env.prod pour Prisma
$env:DATABASE_URL = (
    Get-Content .env.prod |
    Select-String "^DATABASE_URL=" |
    ForEach-Object { $_ -replace 'DATABASE_URL=', '' } |
    ForEach-Object { $_.Trim('"') }
)
$env:DIRECT_URL = $env:DATABASE_URL

npx prisma db push
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

Sortie attendue :

```
✅ Permissions seeded.
✅ Roles & RolePermissions seeded.
✅ Subscription plans seeded.
📊 Seeding 114 KPIs and NLQ data...
✅ KPI Definitions & NLQ seeded.
✅ Widget Templates seeded. (8 types)
✅ KPI Packs seeded. (12 packs)
✅ Seed completed.
```

!!! warning "`--legacy-peer-deps` obligatoire"
    Conflit entre `@adminjs/prisma` et `@prisma/client` v7. Sans ce flag, `npm install` échoue.

### Étape 6 — Démarrer tous les services

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### Étape 7 — Vérifier

```powershell
# État des containers (tous doivent être "healthy" ou "running")
docker ps

# Santé de l'API
Invoke-RestMethod -Uri "https://cockpit.nafaka.tech/api/health"
# {"status":"ok"}

# Swagger (documentation API)
Start-Process "https://cockpit.nafaka.tech/api"
```

---

## 7. Démarrage automatique après reboot Windows

```powershell
$scriptContent = @'
Start-Sleep -Seconds 30
cd C:\Cockpit\repos\insightsage_backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
'@
$scriptContent | Out-File "C:\Cockpit\start-containers.ps1" -Encoding UTF8

$action    = New-ScheduledTaskAction -Execute "PowerShell.exe" `
               -Argument "-NonInteractive -File C:\Cockpit\start-containers.ps1"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" `
               -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName "CockpitDockerStart" `
  -Action $action -Trigger $trigger -Principal $principal `
  -Description "Démarre les containers Cockpit au démarrage Windows"

Get-ScheduledTask -TaskName "CockpitDockerStart"
```

---

## 8. Mises à jour (Rolling update)

```powershell
cd C:\Cockpit\repos\insightsage_backend
git pull origin main

cd C:\Cockpit\repos\Client-cockpit
git pull origin main

cd C:\Cockpit\repos\insightsage_backend

# Reconstruire et redéployer sans downtime
docker compose -f docker-compose.prod.yml --env-file .env.prod `
  up -d --build --no-deps api frontend

# Si modification du schéma DB
docker compose -f docker-compose.prod.yml exec api npx prisma db push

# Vérifier les logs
docker logs cockpit_api -f --tail 100
```

---

## 9. Monitoring

```powershell
# Santé API
Invoke-RestMethod -Uri "https://cockpit.nafaka.tech/api/health"

# Logs en temps réel
docker logs cockpit_api   -f
docker logs cockpit_redis -f
docker logs cockpit_nginx -f

# Ressources des containers
docker stats cockpit_api cockpit_frontend cockpit_postgres cockpit_redis

# Renouvellement SSL (manuel si besoin)
docker compose -f docker-compose.prod.yml exec certbot certbot renew --dry-run
```

---

## 10. Agent On-Premise (chez le client final)

Pour chaque client abonné utilisant Sage 100 en local, l'agent doit être installé **sur leur serveur ERP** (pas sur le serveur Nafaka).

### Prérequis côté client

| Composant | Version | Notes |
|-----------|---------|-------|
| OS | Windows 10/11 Pro ou Server 2016+ | Ou Linux |
| Python | ≥ 3.11 | Si installation native |
| Docker | ≥ 20.x | Si installation Docker |
| ODBC Driver | Microsoft ODBC Driver 17 for SQL Server | Obligatoire |
| SQL Server | Instance Sage 100 accessible | Compte lecture seule requis |
| Réseau | Port **443 sortant** uniquement | Vers `cockpit.nafaka.tech` |

### Créer le compte SQL Server lecture seule

```sql
CREATE LOGIN cockpit_agent WITH PASSWORD = 'MotDePasseComplexe!2026';
USE SAGE_PROD;
CREATE USER cockpit_agent FOR LOGIN cockpit_agent;
GRANT SELECT ON SCHEMA::dbo TO cockpit_agent;
-- Ne pas accorder INSERT, UPDATE, DELETE, EXECUTE
```

### Installer l'agent

=== "Python — Windows Service (recommandé)"

    ```powershell
    winget install Python.Python.3.11

    git clone https://github.com/Nafaka-tech/cockpit-agent.git
    cd cockpit-agent

    pip install -r requirements.txt
    pip install pywin32

    Copy-Item .env.example .env
    notepad .env
    ```

    Contenu du `.env` :
    ```env
    AGENT_TOKEN=isag_votre_token_ici
    API_BASE_URL=https://cockpit.nafaka.tech/api
    SQL_SERVER=localhost\SAGE_INSTANCE
    SQL_DATABASE=SAGE_PROD
    SQL_USERNAME=cockpit_agent
    SQL_PASSWORD=MotDePasseComplexe!2026
    SQL_DRIVER=ODBC Driver 17 for SQL Server
    HEARTBEAT_INTERVAL_SECONDS=30
    LOG_LEVEL=INFO
    ```

    ```powershell
    python main.py --test

    python service.py install
    net start CockpitAgent

    sc query CockpitAgent
    ```

=== "Docker"

    ```yaml
    services:
      cockpit-agent:
        image: nafakatech/cockpit-agent:latest
        container_name: cockpit-agent-prod
        restart: unless-stopped
        environment:
          - AGENT_TOKEN=isag_votre_token_ici
          - API_BASE_URL=https://cockpit.nafaka.tech/api
          - SQL_SERVER=host.docker.internal\SAGE_INSTANCE
          - SQL_DATABASE=SAGE_PROD
          - SQL_USERNAME=cockpit_agent
          - SQL_PASSWORD=MotDePasseComplexe!2026
          - SQL_DRIVER=ODBC Driver 17 for SQL Server
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

### Vérification post-installation

Dans **Admin Cockpit → Agents** :

- [ ] Agent visible avec statut `online` (vert) dans les 30 secondes
- [ ] `lastSeen` se met à jour toutes les 30 secondes

!!! warning "Renouvellement du token (tous les 30 jours)"
    1. Admin Cockpit → **Agents → Régénérer le token**
    2. Mettre à jour `AGENT_TOKEN` dans `.env`
    3. `net restart CockpitAgent` ou `docker compose restart`

---

## 11. Checklist finale avant mise en production

### Serveur Windows

- [ ] Windows Server 2022 Standard
- [ ] WSL2 activé (`wsl --list --verbose` → Ubuntu-22.04 Running 2)
- [ ] Docker Desktop installé et opérationnel (`docker run hello-world`)
- [ ] Docker Desktop configuré pour démarrer avec Windows
- [ ] Git for Windows installé
- [ ] Node.js 20 LTS installé
- [ ] Firewall configuré (80 et 443 autorisés, 3000/5432/6379 bloqués depuis Internet)

### DNS et SSL

- [ ] Enregistrement DNS A configuré vers l'IP du serveur
- [ ] DNS propagé (vérifier avec `nslookup cockpit.nafaka.tech`)
- [ ] Certificats Let's Encrypt générés avec succès
- [ ] `https://cockpit.nafaka.tech` répond avec cadenas vert

### Application

- [ ] `.env.prod` complet (aucune variable vide)
- [ ] `JWT_SECRET` et `JWT_REFRESH_SECRET` générés (valeurs différentes, 64 bytes base64)
- [ ] `npx prisma db push` exécuté sans erreur
- [ ] Seed exécuté : 114 KPIs, 12 Packs, 8 Widget Templates, rôles et plans
- [ ] Tâche planifiée `CockpitDockerStart` créée
- [ ] Tous les containers `healthy` (`docker ps`)
- [ ] `GET https://cockpit.nafaka.tech/api/health` → `{"status":"ok"}`
- [ ] Swagger accessible sur `https://cockpit.nafaka.tech/api`
- [ ] Login Admin Cockpit fonctionnel

### Agent client

- [ ] ODBC Driver 17 installé sur le serveur Sage du client
- [ ] Compte SQL Server lecture seule créé
- [ ] Token agent généré depuis Admin Cockpit et configuré
- [ ] Agent visible `online` dans Admin Cockpit sous 30 secondes

---

## 12. Résumé des versions clés

| Technologie | Version | Rôle |
|-------------|---------|------|
| Windows Server | 2022 Standard | Système hôte |
| WSL2 | 2.x | Noyau Linux pour Docker |
| Docker Desktop | ≥ 4.x (Engine 26.x) | Runtime containers |
| Docker Compose | v2.x | Orchestration |
| Nginx | 1.27 Alpine | Reverse proxy + SSL |
| Certbot | latest | Certificats Let's Encrypt |
| Node.js (container) | 20 LTS Alpine | Runtime NestJS |
| Node.js (hôte) | 20 LTS | Seed / Prisma CLI |
| PostgreSQL | 16 Alpine | Base de données |
| Redis | 7 Alpine | File de jobs Bull |
| Python (agent) | ≥ 3.11 | Agent on-premise |
| ODBC Driver | 17 | Connexion SQL Server Sage 100 |
