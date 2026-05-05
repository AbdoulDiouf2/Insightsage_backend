---
title: Déploiement sans Docker — Windows Server natif
description: Guide de déploiement Cockpit sur Windows Server 2022 sans Docker ni WSL2. PostgreSQL 16, Redis (Memurai) et NestJS via PM2 installés nativement. Pour serveurs VM sans virtualisation imbriquée.
---

# Déploiement Production — Sans Docker (Windows natif)

!!! info "Quand utiliser ce guide"
    Ce guide s'applique lorsque votre serveur est **une VM Windows Server sans virtualisation imbriquée**
    (hébergeurs Hyper-V, Azure, OVH, VMware…). Dans ce cas :

    - ❌ WSL2 impossible → Docker Linux impossible
    - ✅ Ce guide : tout installé **nativement sur Windows Server**

    Si au contraire WSL2 est disponible sur votre serveur, utilisez le guide
    [Déploiement avec Docker](deployment.md).

---

## 1. Architecture cible

```mermaid
graph TD
    Internet["🌐 Internet"] --> FW["🛡️ Firewall Windows\n(ports 80 + 443 uniquement)"]

    FW --> RP["🔀 IIS + ARR / Nginx for Windows\n:80 → :443 (SSL)"]

    RP -->|"votre-domaine.com"| SPA_CLIENT["🖥️ Client Cockpit\nClient-cockpit/dist/\n(DAF / utilisateurs)"]
    RP -->|"admin.votre-domaine.com"| SPA_ADMIN["🛠️ Admin Cockpit\nadmin-cockpit/dist/\n(SuperAdmin)"]
    RP -->|"/api/* et /socket.io/*"| API["⚙️ NestJS API\nlocalhost:3000\n(PM2 cluster)"]

    API --> PG["🐘 PostgreSQL 16\nlocalhost:5432\n(Service Windows)"]
    API --> RD["⚡ Memurai (Redis 7)\nlocalhost:6379\n(Service Windows)"]
```

| Composant | Solution | URL / Accès |
|---|---|---|
| API NestJS | Node.js + PM2 (natif) | `localhost:3000` (interne) |
| Frontend Client | Build statique — IIS | `votre-domaine.com` |
| Frontend Admin | Build statique — IIS | `admin.votre-domaine.com` |
| Base de données | PostgreSQL 16 for Windows | `localhost:5432` (interne) |
| Cache / Jobs | Memurai (compatible Redis 7) | `localhost:6379` (interne) |
| Reverse proxy | IIS + ARR **ou** Nginx for Windows | Port 80/443 |
| SSL | win-acme (Let's Encrypt) | Auto-renouvellement |

---

## 2. Prérequis

### Serveur

- Windows Server 2022 Standard ou Datacenter (64-bit)
- 4 vCPU / 8 Go RAM minimum (16 Go recommandé)
- 60 Go OS + volume dédié données (ex. `D:\Cockpit\data\`)
- Compte **Administrateur local** pour l'installation
- Accès Internet depuis le serveur (téléchargements, Let's Encrypt)

### Réseau / DNS

- Domaine pointé vers l'IP publique du serveur (record `A`)
- Ports 80 et 443 ouverts en entrée (Hébergeur + Firewall Windows — voir [Section 13](#13-firewall-windows))
- Ports 3000, 5432, 6379 **bloqués** vers l'extérieur (accès local uniquement)

!!! tip "Délégation DNS"
    Si vous déléguez la configuration du domaine au client ou à un prestataire IT, 
    transmettez-leur le [Guide de Configuration DNS](dns-setup-guide.md).

### Logiciels à télécharger

| Outil | Version | Source |
|---|---|---|
| Node.js | 20 LTS | nodejs.org/fr/download |
| Git for Windows | Dernière stable | git-scm.com |
| PostgreSQL | 16 (EDB installer) | postgresql.org/download/windows |
| Memurai | Developer Edition | memurai.com/get-memurai |
| IIS ARR | 3.0 | iis.net/downloads/microsoft/application-request-routing |
| IIS URL Rewrite | 2.1 | iis.net/downloads/microsoft/url-rewrite |
| win-acme | Dernière stable | github.com/win-acme/win-acme/releases |

---

## 3. Structure de dossiers

Créer la structure suivante avant de commencer :

```
C:\Cockpit\
├── repos\
│   ├── insightsage_backend\    ← clone du repo backend (API NestJS)
│   ├── Client-cockpit\         ← clone du repo frontend DAF / utilisateurs
│   └── admin-cockpit\          ← clone du repo frontend SuperAdmin
├── logs\                        ← logs PM2
├── ssl\                         ← certificats (si non géré par IIS)
└── data\                        ← (optionnel) données si disque C uniquement
```

```powershell
# PowerShell — créer la structure
New-Item -ItemType Directory -Force -Path C:\Cockpit\repos
New-Item -ItemType Directory -Force -Path C:\Cockpit\logs
New-Item -ItemType Directory -Force -Path C:\Cockpit\ssl
```

---

## 4. Installation Node.js 20 LTS

1. Télécharger l'installeur **Windows 64-bit MSI** depuis nodejs.org
2. Installer avec les options par défaut (cocher "Add to PATH")
3. Vérifier :

```powershell
node -v    # v20.x.x
npm -v     # 10.x.x
```

4. Installer les outils globaux :

```powershell
npm install -g pm2
npm install -g pm2-windows-service
```

---

## 5. Installation PostgreSQL 16

### 5.1 Installer

1. Télécharger l'installeur EDB PostgreSQL 16 for Windows (64-bit)
2. Composants à sélectionner : **PostgreSQL Server**, **pgAdmin 4**, **Command Line Tools**
3. Répertoire data recommandé : `D:\Cockpit\data\postgres\` (ou `C:\Cockpit\data\postgres\`)
4. Port : **5432** (par défaut)
5. Locale : **French, France** ou **Default**
6. Définir un mot de passe fort pour le superutilisateur `postgres`

### 5.2 Créer la base Cockpit

Ouvrir **SQL Shell (psql)** (installé avec PostgreSQL) :

```sql
-- Connexion en superadmin
\c postgres

-- Créer l'utilisateur applicatif
CREATE USER cockpit_user WITH PASSWORD 'REMPLACER_PAR_MOT_DE_PASSE_FORT';

-- Créer la base de données
CREATE DATABASE cockpit OWNER cockpit_user ENCODING 'UTF8';

-- Accorder tous les droits
GRANT ALL PRIVILEGES ON DATABASE cockpit TO cockpit_user;

-- Vérifier
\l
```

### 5.3 Restreindre l'accès réseau

Éditer `pg_hba.conf` (dans `D:\Cockpit\data\postgres\` ou le répertoire data choisi) :

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
# ↑ Accès local uniquement — ne pas ajouter d'entrée pour 0.0.0.0/0
```

Redémarrer le service : `services.msc` → `postgresql-x64-16` → Redémarrer.

### 5.4 Vérifier

```powershell
# Test de connexion locale
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U cockpit_user -d cockpit -c "SELECT version();"
```

---

## 6. Installation Memurai (Redis pour Windows)

!!! note "Pourquoi Memurai ?"
    Redis n'a pas de build officiel Windows depuis la version 3.x (2016).
    **Memurai** est un serveur Redis-compatible (API Redis 7) natif Windows,
    développé par d'anciens contributeurs Redis. La Developer Edition est **gratuite**
    et sans limite de temps d'utilisation.

### 6.1 Installer

1. Télécharger **Memurai Developer Edition** sur memurai.com
2. Lancer l'installeur — s'installe automatiquement comme service Windows
3. Répertoire par défaut : `C:\Program Files\Memurai\`

### 6.2 Configurer

Éditer `C:\Program Files\Memurai\memurai.conf` :

```conf
# Écoute locale uniquement
bind 127.0.0.1

# Port standard Redis
port 6379

# Mot de passe obligatoire
requirepass REMPLACER_PAR_MOT_DE_PASSE_REDIS

# Persistance AOF (recommandé)
appendonly yes
appendfilename "appendonly.aof"

# Répertoire données
dir "C:/ProgramData/Memurai"

# Limite mémoire (adapter à la RAM disponible)
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 6.3 Redémarrer et vérifier

```powershell
# Redémarrer le service Memurai
Restart-Service Memurai

# Test de connexion
& "C:\Program Files\Memurai\memurai-cli.exe" -a VOTRE_MOT_DE_PASSE_REDIS ping
# Réponse attendue : PONG
```

---

## 7. Clone et configuration du backend

```powershell
cd C:\Cockpit\repos
git clone https://github.com/Nafaka-tech/Insightsage_backend.git insightsage_backend
cd insightsage_backend

# Installation des dépendances (flag obligatoire — conflit @adminjs/prisma)
npm install --legacy-peer-deps
```

### 7.1 Fichier `.env.prod`

Créer `C:\Cockpit\repos\insightsage_backend\.env.prod` :

```env
NODE_ENV=production
PORT=3000

# ─── PostgreSQL self-hosted (local) ──────────────────────────────────────────
# En self-hosted, DATABASE_URL et DIRECT_URL sont identiques (pas de PgBouncer)
DATABASE_URL=postgresql://cockpit_user:MOT_DE_PASSE_PG@localhost:5432/cockpit?schema=public
DIRECT_URL=postgresql://cockpit_user:MOT_DE_PASSE_PG@localhost:5432/cockpit?schema=public

# ─── Redis self-hosted (Memurai local) ───────────────────────────────────────
REDIS_URL=redis://:MOT_DE_PASSE_REDIS@localhost:6379

# ─── JWT (générer des secrets uniques) ───────────────────────────────────────
# Commande PowerShell : -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
JWT_SECRET=GENERER_SECRET_64_CHARS
JWT_REFRESH_SECRET=GENERER_SECRET_64_CHARS
JWT_AGENT_SECRET=GENERER_SECRET_64_CHARS

# ─── URLs ─────────────────────────────────────────────────────────────────────
FRONTEND_URL=https://votre-domaine.com

# ─── SMTP (fourni par le client) ──────────────────────────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@votre-domaine.com

# ─── Sentry (optionnel) ───────────────────────────────────────────────────────
SENTRY_DSN=
```

!!! tip "Générer des secrets JWT"
    ```powershell
    # PowerShell — générer un secret cryptographique 64 chars
    $bytes = New-Object byte[] 64
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    [System.BitConverter]::ToString($bytes).Replace('-','').ToLower()
    ```

---

## 8. Initialisation de la base de données

```powershell
cd C:\Cockpit\repos\insightsage_backend

# Pousser le schéma Prisma vers PostgreSQL
$env:NODE_ENV="production"
npx prisma db push --schema=prisma/schema.prisma

# Initialiser les données de référence (rôles + plans subscription)
npx ts-node prisma/seed.ts
```

Vérifier dans pgAdmin 4 que les tables sont créées et que les 5 rôles + 4 plans existent.

---

## 9. Build des frontends

### 9.1 Frontend Client (DAF / utilisateurs)

```powershell
cd C:\Cockpit\repos
git clone https://github.com/Nafaka-tech/Client-cockpit.git Client-cockpit
cd Client-cockpit

npm install

# URL API → domaine principal
Set-Content -Path .env.production -Value "VITE_API_URL=https://votre-domaine.com/api`nVITE_ENV=production"

npm run build
# → C:\Cockpit\repos\Client-cockpit\dist\
```

### 9.2 Frontend Admin (SuperAdmin)

```powershell
cd C:\Cockpit\repos
git clone https://github.com/Nafaka-tech/admin-cockpit.git admin-cockpit
cd admin-cockpit

npm install

# URL API → même backend, sous-domaine admin
Set-Content -Path .env.production -Value "VITE_API_URL=https://votre-domaine.com/api`nVITE_ENV=production"

npm run build
# → C:\Cockpit\repos\admin-cockpit\dist\
```

!!! info "Un seul backend, deux frontends"
    Les deux frontends consomment la même API (`/api/`). La distinction
    d'accès est gérée par les **rôles RBAC** côté NestJS (`superadmin` vs autres rôles).

---

## 10. Configuration PM2

### 10.1 Fichier ecosystem

Créer `C:\Cockpit\repos\insightsage_backend\ecosystem.config.js` :

```js
module.exports = {
  apps: [
    {
      name: 'cockpit-api',
      script: 'dist/main.js',

      // Cluster pour utiliser tous les CPU disponibles
      instances: 2,
      exec_mode: 'cluster',

      // Variables d'environnement
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env.prod',

      // Logs
      error_file: 'C:/Cockpit/logs/api-error.log',
      out_file:   'C:/Cockpit/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Sécurité mémoire
      max_memory_restart: '1G',

      // Restart automatique si crash
      autorestart: true,
      watch: false,
    }
  ]
}
```

### 10.2 Compiler et démarrer

```powershell
cd C:\Cockpit\repos\insightsage_backend

# Compiler TypeScript → dist/
npm run build

# Démarrer avec PM2
pm2 start ecosystem.config.js --env production

# Vérifier le statut
pm2 status

# Sauvegarder la liste des processus (pour restauration après reboot)
pm2 save
```

### 10.3 Service Windows pour PM2 (démarrage automatique)

```powershell
# Installer PM2 comme service Windows
pm2-service-install -n CockpitPM2
```

Vérifier dans `services.msc` :

- Service **CockpitPM2** → Type de démarrage : **Automatique**
- Service **CockpitPM2** → État : **En cours d'exécution**

Au prochain redémarrage du serveur, PM2 et l'API Cockpit démarreront automatiquement.

---

## 11. Reverse proxy

=== "IIS + ARR (recommandé)"

    ### Activer IIS

    Via **Gestionnaire de serveur** → Ajouter des rôles et fonctionnalités :

    - Serveur Web (IIS)
    - Proxy HTTP → cocher **Application Request Routing**
    - Modules IIS courants

    ### Installer les modules IIS

    1. **ARR 3.0** — Application Request Routing (iis.net)
    2. **URL Rewrite 2.1** (iis.net)
    3. Redémarrer IIS après installation : `iisreset`

    ### Activer le proxy dans ARR

    Dans **IIS Manager** → Serveur → Application Request Routing Cache →
    **Server Proxy Settings** → cocher **Enable proxy** → Appliquer.

    ### Créer les deux sites IIS

    **Site 1 — Frontend Client (DAF)**

    1. IIS Manager → Sites → **Ajouter un site Web**
    2. Nom du site : `Cockpit-Client`
    3. Répertoire physique : `C:\Cockpit\repos\Client-cockpit\dist`
    4. Liaison : HTTP, Port 80, Nom d'hôte : `votre-domaine.com`

    **Site 2 — Frontend Admin (SuperAdmin)**

    1. IIS Manager → Sites → **Ajouter un site Web**
    2. Nom du site : `Cockpit-Admin`
    3. Répertoire physique : `C:\Cockpit\repos\admin-cockpit\dist`
    4. Liaison : HTTP, Port 80, Nom d'hôte : `admin.votre-domaine.com`

    !!! warning "DNS requis"
        Créer un record `A` pour `admin.votre-domaine.com` pointant vers la même IP serveur.
        win-acme peut générer un certificat pour les deux domaines en une seule opération.

    ### `web.config` — Site Client (`Client-cockpit\dist\`)

    Proxy `/api/` + `/socket.io/` (WebSocket Dashboard DAF) + SPA React :

    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <configuration>
      <system.webServer>
        <rewrite>
          <rules>
            <!-- WebSocket socket.io (Dashboard DAF temps réel) -->
            <rule name="Cockpit WebSocket" stopProcessing="true">
              <match url="^socket\.io/(.*)" />
              <action type="Rewrite" url="http://localhost:3000/socket.io/{R:1}" />
              <serverVariables>
                <set name="HTTP_X_FORWARDED_PROTO" value="https" />
              </serverVariables>
            </rule>
            <!-- API REST -->
            <rule name="Cockpit API" stopProcessing="true">
              <match url="^api/(.*)" />
              <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
              <serverVariables>
                <set name="HTTP_X_FORWARDED_PROTO" value="https" />
              </serverVariables>
            </rule>
            <!-- React SPA fallback -->
            <rule name="React SPA" stopProcessing="true">
              <match url=".*" />
              <conditions logicalGrouping="MatchAll">
                <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                <add input="{REQUEST_URI}" pattern="^/api" negate="true" />
                <add input="{REQUEST_URI}" pattern="^/socket\.io" negate="true" />
              </conditions>
              <action type="Rewrite" url="/index.html" />
            </rule>
          </rules>
        </rewrite>
        <webSocket enabled="true" />
        <httpProtocol>
          <customHeaders>
            <add name="X-Content-Type-Options" value="nosniff" />
            <add name="X-Frame-Options" value="DENY" />
            <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
          </customHeaders>
        </httpProtocol>
      </system.webServer>
    </configuration>
    ```

    ### `web.config` — Site Admin (`admin-cockpit\dist\`)

    Proxy `/api/` uniquement (pas de WebSocket sur le panneau admin) + SPA React :

    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <configuration>
      <system.webServer>
        <rewrite>
          <rules>
            <!-- API REST -->
            <rule name="Cockpit Admin API" stopProcessing="true">
              <match url="^api/(.*)" />
              <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
              <serverVariables>
                <set name="HTTP_X_FORWARDED_PROTO" value="https" />
              </serverVariables>
            </rule>
            <!-- React SPA fallback -->
            <rule name="Admin SPA" stopProcessing="true">
              <match url=".*" />
              <conditions logicalGrouping="MatchAll">
                <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                <add input="{REQUEST_URI}" pattern="^/api" negate="true" />
              </conditions>
              <action type="Rewrite" url="/index.html" />
            </rule>
          </rules>
        </rewrite>
        <!-- Upload agent releases : lever la limite de taille IIS (défaut 30MB) -->
        <security>
          <requestFiltering>
            <requestLimits maxAllowedContentLength="524288000" /> <!-- 500 MB -->
          </requestFiltering>
        </security>
        <httpProtocol>
          <customHeaders>
            <add name="X-Content-Type-Options" value="nosniff" />
            <add name="X-Frame-Options" value="SAMEORIGIN" />
            <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
          </customHeaders>
        </httpProtocol>
      </system.webServer>
    </configuration>
    ```

    !!! warning "ARR timeout — commande à exécuter une seule fois sur le serveur"
        Le timeout proxy ARR par défaut est **30 secondes**. Pour les uploads de gros binaires
        (agent releases > 50 Mo sur connexion lente), augmenter à 10 minutes :

        ```powershell
        Import-Module WebAdministration
        Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
            -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:10:00'
        iisreset
        ```

        Vérifier : `Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'timeout'`

    !!! info "Architecture upload agent releases (depuis v1.2)"
        Les releases agent sont uploadées **directement depuis le navigateur vers MinIO** via URL pré-signée (presigned PUT). L'API NestJS n'est plus dans le chemin du fichier → le timeout IIS ARR est hors-sujet pour ces uploads. Seul le step de confirmation (JSON léger) passe par le proxy.

        **Pré-requis : configurer les CORS MinIO** pour autoriser le navigateur à faire un PUT direct.

        ```powershell
        # Via le client mc (MinIO Client) — à installer si absent
        # mc.exe alias set myminio http://localhost:9000 MINIO_ROOT_USER MINIO_ROOT_PASSWORD
        mc.exe cors set myminio/cockpit-storage `
          --allowed-origins "https://admin.votre-domaine.com" `
          --allowed-methods "PUT,GET,HEAD" `
          --allowed-headers "*" `
          --max-age "3600"
        ```

        Ou via l'interface MinIO Console → Bucket → Access → CORS.

        Si MinIO tourne derrière IIS ARR sur un sous-chemin (ex: `/storage/*`), le PUT presigned passe bien par HTTPS sans problème de mixed content.

=== "Nginx for Windows (alternative)"

    !!! note
        Nginx for Windows est une option plus simple à configurer mais tourne en
        foreground (non-service natif). Utiliser **NSSM** pour l'enrouler comme service Windows.

    ### Télécharger Nginx for Windows

    Télécharger la version stable depuis nginx.org/en/download.html → Extraire dans `C:\nginx\`.

    ### Configuration `nginx.conf`

    Remplacer `C:\nginx\conf\nginx.conf` :

    ```nginx
    worker_processes auto;

    events {
        worker_connections 1024;
    }

    http {
        include       mime.types;
        default_type  application/octet-stream;
        sendfile      on;
        keepalive_timeout 65;

        # Gzip
        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml;

        upstream cockpit_api {
            server 127.0.0.1:3000;
            keepalive 32;
        }

        # ── Frontend Client (DAF / utilisateurs) ──────────────────────────────
        server {
            listen 80;
            server_name votre-domaine.com;

            root C:/Cockpit/repos/Client-cockpit/dist;
            index index.html;

            # API REST → NestJS
            location /api/ {
                proxy_pass         http://cockpit_api;
                proxy_http_version 1.1;
                proxy_set_header   Host              $host;
                proxy_set_header   X-Real-IP         $remote_addr;
                proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
                proxy_set_header   X-Forwarded-Proto $scheme;
            }

            # WebSocket socket.io (Dashboard DAF temps réel)
            location /socket.io/ {
                proxy_pass         http://cockpit_api;
                proxy_http_version 1.1;
                proxy_set_header   Upgrade    $http_upgrade;
                proxy_set_header   Connection "upgrade";
                proxy_set_header   Host       $host;
                proxy_read_timeout 3600s;
            }

            # SPA React fallback
            location / {
                try_files $uri $uri/ /index.html;
            }
        }

        # ── Frontend Admin (SuperAdmin) ────────────────────────────────────────
        server {
            listen 80;
            server_name admin.votre-domaine.com;

            root C:/Cockpit/repos/admin-cockpit/dist;
            index index.html;

            # API REST → même backend NestJS
            location /api/ {
                proxy_pass         http://cockpit_api;
                proxy_http_version 1.1;
                proxy_set_header   Host              $host;
                proxy_set_header   X-Real-IP         $remote_addr;
                proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
                proxy_set_header   X-Forwarded-Proto $scheme;
            }

            # SPA React fallback (pas de WebSocket sur le panneau admin)
            location / {
                try_files $uri $uri/ /index.html;
            }
        }
    }
    ```

    ### Installer comme service Windows via NSSM

    ```powershell
    # Télécharger NSSM depuis nssm.cc, extraire dans C:\tools\nssm\
    C:\tools\nssm\win64\nssm.exe install CockpitNginx C:\nginx\nginx.exe
    C:\tools\nssm\win64\nssm.exe set CockpitNginx AppDirectory C:\nginx
    C:\tools\nssm\win64\nssm.exe start CockpitNginx
    ```

---

## 12. SSL/TLS avec win-acme (Let's Encrypt)

!!! warning "Prérequis SSL"
    Le domaine doit déjà pointer vers l'IP du serveur et le port 80 doit être accessible
    depuis Internet avant de générer le certificat.

1. Télécharger **win-acme** depuis github.com/win-acme/win-acme/releases
2. Extraire dans `C:\tools\win-acme\`
3. Lancer en administrateur :

```powershell
C:\tools\win-acme\wacs.exe
```

4. Choisir : **M** → Gérer les certificats → **N** → Nouveau certificat
5. Sélectionner les deux sites IIS : `Cockpit-Client` **et** `Cockpit-Admin`
   (win-acme gère un certificat SAN couvrant les 2 domaines en une seule passe).
6. Le renouvellement automatique est planifié via une tâche Windows (Task Scheduler)

!!! success "Résultat"
    IIS est maintenant configuré avec HTTPS sur le port 443 et une redirection automatique HTTP→HTTPS.

---

## 13. Firewall Windows

Il y a deux niveaux de firewall à configurer :
1. **Niveau Hébergeur** (AWS, Azure, OVH, etc.) : Ouvrez les ports 80 et 443 dans la console de gestion (Security Groups / Network ACL).
2. **Niveau Windows Server** (OS) : Utilisez les commandes PowerShell ci-dessous ou l'interface graphique.

### 13.1 Par PowerShell (Recommandé)

```powershell
# Autoriser HTTP et HTTPS en entrée
New-NetFirewallRule -Name "Cockpit-HTTP"  -DisplayName "Cockpit HTTP"  `
  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -Name "Cockpit-HTTPS" -DisplayName "Cockpit HTTPS" `
  -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Bloquer accès direct à l'API, PostgreSQL et Redis depuis l'extérieur
New-NetFirewallRule -Name "Block-API"   -DisplayName "Block API Port 3000" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Block
New-NetFirewallRule -Name "Block-PG"    -DisplayName "Block PostgreSQL 5432" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Block
New-NetFirewallRule -Name "Block-Redis" -DisplayName "Block Redis 6379" `
  -Direction Inbound -Protocol TCP -LocalPort 6379 -Action Block
```

### 13.2 Par l'interface graphique (Alternative)

1. Ouvrez **Pare-feu Windows avec fonctions avancées de sécurité**.
2. Cliquez sur **Règles de trafic entrant** (Inbound Rules) > **Nouvelle règle**.
3. Type de règle : **Port** > Suivant.
4. Protocole : **TCP**, Ports locaux spécifiques : **80, 443** > Suivant.
5. Action : **Autoriser la connexion** > Suivant.
6. Profil : Cocher **Domaine**, **Privé** et **Public** > Suivant.
7. Nom : `Cockpit-Web-Ports` > Terminer.

!!! warning "Sécurité"
    N'ouvrez jamais les ports de la base de données (5432) ou de Redis (6379) à l'extérieur. Seul le reverse proxy (IIS/Nginx) doit être exposé.

---

## 14. Monitoring & logs

### PM2

```powershell
pm2 status                   # État de tous les processus
pm2 monit                    # Dashboard temps réel (CPU, RAM, logs)
pm2 logs cockpit-api         # Logs en direct
pm2 logs cockpit-api --lines 100   # 100 dernières lignes
```

### Fichiers de logs

| Composant | Chemin |
|---|---|
| API (stdout) | `C:\Cockpit\logs\api-out.log` |
| API (erreurs) | `C:\Cockpit\logs\api-error.log` |
| PostgreSQL | `C:\Program Files\PostgreSQL\16\data\log\` |
| IIS | `C:\inetpub\logs\LogFiles\` |
| Memurai | `C:\ProgramData\Memurai\memurai.log` |

### Health check

```powershell
# Vérification rapide de l'API
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing
# Réponse attendue : {"status":"ok"}
```

---

## 15. Procédure de mise à jour

### Backend

```powershell
cd C:\Cockpit\repos\insightsage_backend

git pull origin main
npm install --legacy-peer-deps
npm run build

# Si le schéma Prisma a changé
$env:NODE_ENV="production"
npx prisma db push

# Rechargement zero-downtime (mode cluster PM2)
pm2 reload cockpit-api
```

### Frontend Client

```powershell
cd C:\Cockpit\repos\Client-cockpit
git pull origin main
npm install
npm run build
# IIS sert immédiatement les nouveaux fichiers depuis dist/ (aucun redémarrage)
```

### Frontend Admin

```powershell
cd C:\Cockpit\repos\admin-cockpit
git pull origin main
npm install
npm run build
# IIS sert immédiatement les nouveaux fichiers depuis dist/ (aucun redémarrage)
```
---

## 16. Checklist pré-production

### Serveur & OS

- [ ] Windows Server 2022 activé et à jour (Windows Update)
- [ ] Compte administrateur dédié (pas le compte `Administrator` par défaut)
- [ ] RDP uniquement sur réseau privé / VPN (port 3389 non exposé)
- [ ] Disque données séparé monté (si disponible)

### PostgreSQL

- [ ] Service `postgresql-x64-16` démarrage **Automatique**
- [ ] Utilisateur `cockpit_user` créé avec mot de passe fort
- [ ] Base `cockpit` créée et accessible
- [ ] `pg_hba.conf` : accès local uniquement (`127.0.0.1/32`)
- [ ] Seed exécuté : 5 rôles + 4 plans présents en base
- [ ] Sauvegarde automatique planifiée (`pg_dump` via Task Scheduler)

### Memurai (Redis)

- [ ] Service `Memurai` démarrage **Automatique**
- [ ] Mot de passe `requirepass` configuré dans `memurai.conf`
- [ ] `bind 127.0.0.1` configuré (accès local uniquement)
- [ ] Test `memurai-cli ping` → `PONG`

### Node.js / PM2

- [ ] Node.js 20 LTS installé (`node -v`)
- [ ] PM2 installé globalement (`pm2 -v`)
- [ ] Service `CockpitPM2` démarrage **Automatique**
- [ ] `pm2 status` : `cockpit-api` en `online`
- [ ] `pm2 save` exécuté après le premier démarrage

### Frontend Client (`Client-cockpit`)

- [ ] Build React généré sans erreur (`npm run build`)
- [ ] Dossier `Client-cockpit\dist\` non vide
- [ ] `VITE_API_URL` pointe vers `https://votre-domaine.com/api`
- [ ] Site IIS `Cockpit-Client` pointe sur `Client-cockpit\dist\`
- [ ] `web.config` client présent avec règles `/api/`, `/socket.io/` et SPA fallback

### Frontend Admin (`admin-cockpit`)

- [ ] Build React généré sans erreur (`npm run build`)
- [ ] Dossier `admin-cockpit\dist\` non vide
- [ ] `VITE_API_URL` pointe vers `https://votre-domaine.com/api`
- [ ] Site IIS `Cockpit-Admin` pointe sur `admin-cockpit\dist\`
- [ ] `web.config` admin présent avec règle `/api/` et SPA fallback
- [ ] DNS `admin.votre-domaine.com` → même IP serveur

### Reverse proxy (IIS ou Nginx)

- [ ] ARR 3.0 + URL Rewrite 2.1 installés (IIS)
- [ ] Proxy activé dans ARR Server Proxy Settings
- [ ] `web.config` créé dans `dist/` avec les règles de rewrite
- [ ] WebSocket proxy fonctionnel

### SSL/TLS

- [ ] Certificat Let's Encrypt généré via win-acme
- [ ] HTTPS sur port 443 fonctionnel
- [ ] Redirection HTTP → HTTPS active
- [ ] Renouvellement automatique planifié (tâche win-acme dans Task Scheduler)

### Variables d'environnement

- [ ] `.env.prod` présent et non commité dans git (`.gitignore`)
- [ ] `DATABASE_URL` valide (test : `npx prisma db push` sans erreur)
- [ ] `REDIS_URL` valide (test : `memurai-cli ping`)
- [ ] Secrets JWT générés de manière cryptographique (64+ chars)
- [ ] `FRONTEND_URL` correspond au domaine réel

### Firewall

- [ ] Ports 80 et 443 ouverts en entrée
- [ ] Ports 3000, 5432, 6379 bloqués vers l'extérieur
- [ ] RDP (3389) restreint aux IPs autorisées

### Vérifications finales

- [ ] `GET https://votre-domaine.com/api/health` → `{"status":"ok"}`
- [ ] Swagger accessible : `https://votre-domaine.com/api`
- [ ] Frontend **Client** charge : `https://votre-domaine.com`
- [ ] Frontend **Admin** charge : `https://admin.votre-domaine.com`
- [ ] Connexion WebSocket depuis le client frontend (pas d'erreur réseau)
- [ ] Superadmin peut se connecter depuis `admin.votre-domaine.com`
- [ ] Utilisateur DAF peut se connecter depuis `votre-domaine.com`
- [ ] Agent on-premise peut se connecter et envoyer un heartbeat

---

## Annexe — Commandes utiles au quotidien

```powershell
# ─── PM2 ────────────────────────────────────────────────────────────────────
pm2 status                       # État des processus
pm2 reload cockpit-api           # Rechargement zero-downtime
pm2 restart cockpit-api          # Redémarrage complet
pm2 logs cockpit-api --lines 50  # Dernières 50 lignes de logs
pm2 monit                        # Dashboard interactif

# ─── PostgreSQL ──────────────────────────────────────────────────────────────
# Démarrer / arrêter le service
Start-Service postgresql-x64-16
Stop-Service  postgresql-x64-16

# Connexion psql
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U cockpit_user -d cockpit

# Sauvegarde manuelle
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U cockpit_user cockpit > C:\Cockpit\backup_$(Get-Date -Format 'yyyyMMdd').sql

# ─── Memurai ─────────────────────────────────────────────────────────────────
Start-Service Memurai
Stop-Service  Memurai
& "C:\Program Files\Memurai\memurai-cli.exe" -a MOT_DE_PASSE info server

# ─── IIS ─────────────────────────────────────────────────────────────────────
iisreset          # Redémarrer IIS
iisreset /stop    # Arrêter IIS
iisreset /start   # Démarrer IIS

# ─── Vérification services ───────────────────────────────────────────────────
Get-Service postgresql-x64-16, Memurai, CockpitPM2 | Select-Object Name, Status, StartType
```
