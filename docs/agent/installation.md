---
title: Guide d'installation de l'Agent
description: Installation de l'agent sur Windows (Python/Service) ou Docker
---

# Guide d'installation de l'Agent

## Prérequis

| Composant | Requis | Notes |
|-----------|--------|-------|
| Système d'exploitation | Windows 10/11 ou Linux | Server Core supporté |
| Python | ≥ 3.11 | Pour l'installation Python native |
| Docker | 20.x+ | Pour l'installation Docker |
| Accès SQL Server | Compte lecture seule | Voir [Vue d'ensemble](overview.md) |
| Accès réseau sortant | Port 443 (HTTPS) | Vers `api.cockpit.nafaka.tech` |
| Token Agent | `isag_xxx...` | Généré depuis le Admin Cockpit |

---

## Option A : Installation Python (Windows Service)

### 1. Télécharger l'agent

```bash
# Depuis le dépôt Nafaka Tech (exemple)
git clone https://github.com/Nafaka-tech/cockpit-agent.git
cd cockpit-agent
```

### 2. Installer les dépendances

```bash
pip install -r requirements.txt
```

Dépendances principales :
- `pyodbc` — Connecteur SQL Server
- `requests` — Appels HTTPS vers l'API
- `python-dotenv` — Variables d'environnement
- `schedule` — Planification des tâches

### 3. Configurer l'environnement

Créez le fichier `.env` dans le répertoire de l'agent :

```env
# ============================================================
# TOKEN D'AGENT (généré depuis Admin Cockpit)
# ============================================================
AGENT_TOKEN=isag_votre_token_ici

# ============================================================
# API InsightSage
# ============================================================
API_BASE_URL=https://api.cockpit.nafaka.tech/api

# ============================================================
# CONNEXION SQL SERVER (Sage ERP)
# ============================================================
SQL_SERVER=localhost\SAGE_INSTANCE
SQL_DATABASE=SAGE_PROD
SQL_USERNAME=cockpit_agent
SQL_PASSWORD=VotreMotDePasseSQL
SQL_DRIVER=ODBC Driver 17 for SQL Server

# ============================================================
# PARAMÈTRES DE SYNCHRONISATION
# ============================================================
SYNC_INTERVAL_MINUTES=15
HEARTBEAT_INTERVAL_SECONDS=30
LOG_LEVEL=INFO
```

!!! warning "Sécurité du fichier .env"
    Définissez des droits restrictifs sur le fichier `.env` :
    ```powershell
    # Windows PowerShell
    $acl = Get-Acl .env
    $acl.SetAccessRuleProtection($true, $false)
    Set-Acl .env $acl
    ```

### 4. Tester la connexion

```bash
python main.py --test
```

Sortie attendue :
```
[2026-03-02 10:00:00] INFO  Connexion SQL Server : OK
[2026-03-02 10:00:00] INFO  API InsightSage : OK (ping 45ms)
[2026-03-02 10:00:00] INFO  Enregistrement agent : OK (status: online)
[2026-03-02 10:00:00] INFO  Tous les tests passés ✓
```

### 5. Démarrage normal

```bash
python main.py
```

### 6. Installer comme service Windows

```powershell
# Installer pywin32 pour le service Windows
pip install pywin32

# Installer le service
python service.py install

# Démarrer le service
net start CockpitAgent

# Vérifier le statut
sc query CockpitAgent
```

Le service démarre automatiquement avec Windows et redémarre en cas de crash.

---

## Option B : Installation Docker

### 1. Créer le fichier `docker-compose.yml`

```yaml
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
      - SQL_PASSWORD=VotreMotDePasseSQL
      - SQL_DRIVER=ODBC Driver 17 for SQL Server
      - SYNC_INTERVAL_MINUTES=15
      - HEARTBEAT_INTERVAL_SECONDS=30

    volumes:
      - ./logs:/app/logs

    extra_hosts:
      - "host.docker.internal:host-gateway"

    network_mode: bridge
```

!!! info "SQL Server sur l'hôte"
    Utilisez `host.docker.internal` pour accéder au SQL Server sur la machine hôte
    depuis le container Docker. Assurez-vous que SQL Server accepte les connexions TCP/IP.

### 2. Démarrer le container

```bash
docker compose up -d

# Vérifier les logs
docker logs cockpit-agent-prod -f

# Arrêter
docker compose down
```

---

## Configuration avancée

### Proxy d'entreprise

Si l'accès à Internet passe par un proxy HTTP :

```env
# .env
HTTP_PROXY=http://proxy.acme.com:8080
HTTPS_PROXY=http://proxy.acme.com:8080
NO_PROXY=localhost,127.0.0.1,*.acme.internal
```

### Instances Sage multiples

Pour synchroniser plusieurs bases Sage vers la même organisation :

```env
# Connexion 1 (Production)
SQL_SERVER_1=prod-server\SAGE
SQL_DATABASE_1=SAGE_PROD

# Connexion 2 (Filiale)
SQL_SERVER_2=filia-server\SAGE
SQL_DATABASE_2=SAGE_FILIA
```

### Logs de l'agent

Les logs sont écrits dans `./logs/agent-YYYY-MM-DD.log` avec rotation journalière.

Niveaux disponibles : `DEBUG`, `INFO`, `WARNING`, `ERROR`

---

## Procédure de mise à jour

=== "Python Service"
    ```bash
    # Arrêter le service
    net stop CockpitAgent

    # Mettre à jour le code
    git pull origin main
    pip install -r requirements.txt --upgrade

    # Redémarrer
    net start CockpitAgent
    ```

=== "Docker"
    ```bash
    docker compose pull
    docker compose up -d --force-recreate
    ```

---

## Renouvellement du token (tous les 30 jours)

!!! warning "Action requise avant expiration"
    Surveillez les alertes `isExpiringSoon` dans le Admin Cockpit (badge sur la page Agents).

1. Dans Admin Cockpit, allez sur **Agents → Votre agent → Régénérer le token**
2. Copiez le **nouveau token**
3. Mettez à jour `AGENT_TOKEN` dans `.env`
4. Redémarrez l'agent :
   ```bash
   net restart CockpitAgent  # Windows Service
   # ou
   docker compose restart    # Docker
   ```

---

## Vérification post-installation

Dans le **Admin Cockpit** :

1. Allez sur **Agents**
2. L'agent devrait apparaître avec le statut `online` (vert) dans les 30 secondes
3. `lastSeen` doit se mettre à jour toutes les 30 secondes
4. `rowsSynced` doit augmenter après le premier cycle de sync

```bash
# Vérification API directe
curl -H "Authorization: Bearer <votre_access_token>" \
  https://api.cockpit.nafaka.tech/api/agents/status
```
