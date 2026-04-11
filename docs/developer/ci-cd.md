---
title: CI/CD — GitHub Actions
description: Pipelines d'intégration et de déploiement continus (Docker & Windows Natif)
---

# CI/CD — GitHub Actions

Cette documentation décrit les pipelines automatisés pour Cockpit. Nous supportons deux modes de déploiement : **Docker (Linux/WSL2)** et **Natif (Windows Server)**.

---

## 🚀 Vue d'ensemble des flux

```mermaid
graph TD
    PUSH["git push"] --> CI["CI Pipeline\n(Lint + Test)"]
    CI -->|"✅ Succès"| PR["Pull Request"]
    PR -->|"✅ Merge"| BRANCH{Branche ?}
    
    BRANCH -->|"main"| DEPLOY_PROD[Déploiement Production]
    BRANCH -->|"develop"| DEPLOY_STAGING[Déploiement Staging]
    
    DEPLOY_PROD --> MODE{Architecture ?}
    MODE -->|Docker| DOCKER["Docker Push + Compose Up"]
    MODE -->|Windows| WIN["SSH + git pull + pm2 reload"]

    style CI fill:#0f3d3d,stroke:#0d9488,color:#2dd4bf
    style DOCKER fill:#064e3b,stroke:#22c55e,color:#22c55e
    style WIN fill:#1e3a8a,stroke:#3b82f6,color:#bfdbfe
```

---

## 1. Intégration Continue (CI)

Le pipeline CI est commun aux deux architectures. Il garantit que le code est sain avant tout déploiement.

### `.github/workflows/ci-backend.yml`
Exécute : ESLint, Prettier, Type Check (TSC) et Tests Unitaires (Jest).

### `.github/workflows/ci-frontend.yml`
Exécute : ESLint, Type Check (TSC) et Tests Unitaires (Vitest).

---

## 2. Déploiement Continu (CD) — Mode Windows Natif

Ce pipeline automatise les étapes du guide [Déploiement sans Docker](deployment-sans-docker.md) en se connectant au serveur via SSH.

### `.github/workflows/deploy-windows.yml`

```yaml
name: Deploy — Windows Native (IIS)

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Windows Server
    runs-on: ubuntu-latest
    
    steps:
      - name: Deploy via SSH (PowerShell)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script_stop: true
          # On force l'utilisation de PowerShell sur le serveur Windows
          script: |
            powershell.exe -Command "
              Write-Host '--- Début Déploiement Backend ---'
              cd C:\Cockpit\repos\insightsage_backend
              git pull origin main
              npm install --legacy-peer-deps
              npm run build
              # Migration Prisma (si nécessaire)
              `$env:NODE_ENV='production'
              npx prisma db push
              pm2 reload cockpit-api
              
              Write-Host '--- Début Déploiement Frontends ---'
              cd C:\Cockpit\repos\Client-cockpit
              git pull origin main
              npm install
              npm run build
              
              cd C:\Cockpit\repos\admin-cockpit
              git pull origin main
              npm install
              npm run build
              
              Write-Host '✅ Déploiement Windows réussi'
            "
```

---

## 3. Déploiement Continu (CD) — Mode Docker

Ce pipeline est utilisé si votre infrastructure repose sur Docker et Docker Compose.

### `.github/workflows/deploy-docker.yml`

```yaml
name: Deploy — Docker (Linux)

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/cockpit
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --no-deps api cockpit
            docker image prune -f
```

---

## 4. Configuration Requise

### Secrets GitHub
Pour que les pipelines fonctionnent, configurez les secrets dans `Settings > Secrets and variables > Actions` :

| Secret | Description |
|---|---|
| `PROD_HOST` | IP publique de votre serveur Windows |
| `PROD_USER` | Nom d'utilisateur (ex: `Administrator`) |
| `PROD_SSH_KEY` | Clé privée SSH (doit correspondre à la clé publique dans `authorized_keys`) |

### 4.2 Configuration des clés SSH (Accès sans mot de passe)

Pour que GitHub puisse se connecter à votre serveur, vous devez utiliser un couple de clés (Publique/Privée).

#### A. Générer les clés (sur votre PC local)
Ouvrez un terminal et tapez :
```bash
ssh-keygen -t rsa -b 4096 -f cockpit_deploy_key
```
-   Cela génère deux fichiers : `cockpit_deploy_key` (**Clé Privée**) et `cockpit_deploy_key.pub` (**Clé Publique**).

#### B. Installer la clé PUBLIQUE sur le serveur Windows
1.  Connectez-vous à votre serveur Windows.
2.  **Si vous utilisez un compte Administrateur** (cas le plus courant) :
    -   Ouvrez le fichier `C:\ProgramData\ssh\administrators_authorized_keys` (créez-le s'il n'existe pas).
    -   Collez-y le contenu de votre fichier `.pub`.
    -   **Important** : Clic droit sur le fichier > Propriétés > Sécurité > Avancé. Assurez-vous que seul l'utilisateur `SYSTEM` et le groupe `Administrators` ont accès au fichier. Désactivez l'héritage.
3.  **Si vous utilisez un compte utilisateur standard** :
    -   Collez la clé dans `C:\Users\VotreUser\.ssh\authorized_keys`.

#### C. Installer la clé PRIVÉE dans GitHub
1.  Allez sur votre dépôt GitHub : `Settings > Secrets and variables > Actions`.
2.  Créez un nouveau secret nommé `PROD_SSH_KEY`.
3.  Copiez-collez tout le contenu de la **Clé Privée** (le fichier sans `.pub`).

### 4.3 Activation de OpenSSH sur Windows Server 2022
1.  **Installer le serveur** :
    ```powershell
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    ```
2.  **Démarrer le service** :
    ```powershell
    Start-Service sshd
    Set-Service -Name sshd -StartupType 'Automatic'
    ```
3.  **Ouvrir le port 22** : 
    -   Dans le firewall Windows : `New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow`
    -   Dans la console de votre hébergeur (AWS/OVH/etc.), autorisez le port 22.

---

## 5. Build de la documentation (MkDocs)

La documentation est déployée automatiquement sur GitHub Pages à chaque push sur `main`.

### `.github/workflows/docs.yml`
Utilise `mkdocs-material` pour générer le site statique et le pousser sur la branche `gh-pages`.

---

## Lancer la doc localement

```bash
pip install mkdocs-material mkdocs-mermaid2-plugin
cd Insightsage_backend
mkdocs serve
```
