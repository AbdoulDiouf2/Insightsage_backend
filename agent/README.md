# InsightSage Agent 🔐

Agent On-Premise sécurisé pour connecter le SaaS InsightSage aux bases de données Sage (100 / X3).

## 📋 Options d'Installation

| Environnement | Script | Documentation |
|---------------|--------|---------------|
| **Serveur Linux** | `scripts/install_server_linux.sh` | [Guide complet](docs/INSTALLATION_SERVEUR.md) |
| **Windows Server** | `scripts/install_server_windows.bat` | [Guide complet](docs/INSTALLATION_SERVEUR.md) |
| **Docker** | `docker-compose up -d` | [Guide complet](docs/INSTALLATION_SERVEUR.md) |
| **Poste développeur** | `start.sh` / `start.bat` | Ce README |

> 💡 **Recommandation** : Installez l'agent sur un **serveur interne** (Linux ou Windows Server) pour une disponibilité 24/7. Le serveur ne s'éteint jamais, garantissant que l'agent est toujours actif.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD (SaaS)                              │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Frontend   │───▶│  Backend NestJS │◀───│  InsightSage    │  │
│  │  DAF/CFO    │    │  (API REST)     │    │  Database       │  │
│  └─────────────┘    └────────┬────────┘    └─────────────────┘  │
│                              │                                    │
│                    Heartbeat │ (toutes les 30s)                  │
│                    + Queries │ (HTTPS sortant)                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                    ╔══════════╧══════════╗
                    ║  FIREWALL CLIENT    ║
                    ║  (Port 443 sortant) ║
                    ╚══════════╤══════════╝
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                         ON-PREMISE                                │
│                              │                                    │
│                    ┌─────────▼─────────┐                         │
│                    │  InsightSage      │                         │
│                    │  Agent (Python)   │                         │
│                    │  Port 8080 local  │                         │
│                    └─────────┬─────────┘                         │
│                              │                                    │
│                    ┌─────────▼─────────┐                         │
│                    │  SQL Server       │                         │
│                    │  Sage 100 / X3    │                         │
│                    │  (Read-Only)      │                         │
│                    └───────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

## ⚡ Installation Rapide (< 5 minutes)

### Prérequis

- **Windows** : Windows 10/11 ou Windows Server 2016+
- **Linux** : Ubuntu 20.04+ / RHEL 8+ / Debian 11+
- **Python** : 3.10+ (inclus dans l'exécutable Windows)
- **ODBC Driver** : Microsoft ODBC Driver 17 for SQL Server
- **Réseau** : Accès sortant HTTPS (port 443)

### Étape 1 : Télécharger l'Agent

```bash
# Option A : Clone du repo
git clone https://github.com/insightsage/agent.git
cd agent

# Option B : Télécharger l'exécutable Windows
# Disponible sur : https://releases.insightsage.com/agent/latest
```

### Étape 2 : Installer les dépendances

**Windows :**
```powershell
# Créer l'environnement virtuel
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**Linux :**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Étape 3 : Configurer

```bash
# Copier le fichier de configuration
cp config/config.example.yaml config/config.yaml

# Éditer avec vos paramètres
nano config/config.yaml  # ou notepad sur Windows
```

**⚠️ Paramètres obligatoires à modifier :**

```yaml
sage:
  host: "192.168.1.10"        # IP du serveur SQL Server
  database: "VOTRE_BASE_SAGE"  # Nom de la base Sage
  username: "sa_readonly"      # Utilisateur lecture seule
  password: "VOTRE_MOT_DE_PASSE"

backend:
  agent_token: "VOTRE_TOKEN"   # Fourni lors de l'onboarding
```

### Étape 4 : Tester

```bash
# Démarrer l'agent manuellement
python -m src.main

# Dans un autre terminal, tester
curl http://localhost:8080/ping
```

### Étape 5 : Installer en tant que service

**Windows (Administrateur) :**
```powershell
.\scripts\install_service.bat
```

**Linux (root) :**
```bash
sudo ./scripts/install_service.sh
```

---

## 📁 Structure du Projet

```
agent/
├── config/
│   ├── config.example.yaml   # Template de configuration
│   └── config.yaml           # Votre configuration (à créer)
├── src/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py         # Endpoints API
│   ├── __init__.py
│   ├── config.py             # Gestion configuration
│   ├── database.py           # Connexion Sage SQL Server
│   ├── heartbeat.py          # Communication backend
│   ├── main.py               # Point d'entrée
│   └── security.py           # Validation SQL
├── scripts/
│   ├── install_service.bat   # Installation Windows
│   └── install_service.sh    # Installation Linux
├── tests/
│   └── test_security.py      # Tests unitaires
├── logs/                      # Logs (auto-créé)
├── build.spec                 # PyInstaller config
├── requirements.txt
└── README.md
```

---

## 🔌 API Endpoints

### `GET /ping` - Health Check

Vérifie l'état de l'agent et des connexions.

**Réponse :**
```json
{
  "status": "ok",
  "agent_name": "InsightSage-Agent-01",
  "version": "1.0.0",
  "timestamp": "2026-01-15T10:30:00Z",
  "sage_connected": true,
  "backend_registered": true
}
```

### `GET /health` - Health Check Simple

Pour les load balancers et monitoring.

**Réponse :**
```json
{"status": "ok"}
```

### `POST /execute_sql` - Exécuter une requête SQL

Exécute une requête SELECT sur la base Sage.

**Headers :**
```
Content-Type: application/json
```

**Body :**
```json
{
  "sql_query": "SELECT TOP 10 DO_Piece, DO_Date, DO_TotalHT FROM F_DOCENTETE WHERE DO_Type = 1"
}
```

**Réponse :**
```json
{
  "result": [
    {"DO_Piece": "FA0001", "DO_Date": "2026-01-15", "DO_TotalHT": 1500.00},
    {"DO_Piece": "FA0002", "DO_Date": "2026-01-14", "DO_TotalHT": 2300.50}
  ],
  "metadata": {
    "rows": 2,
    "columns": ["DO_Piece", "DO_Date", "DO_TotalHT"],
    "exec_time_ms": 45
  }
}
```

**Erreurs possibles :**

| Code | Description |
|------|-------------|
| 403 | Requête SQL non autorisée (sécurité) |
| 400 | Erreur d'exécution SQL |
| 429 | Rate limit dépassé (10 req/min) |
| 500 | Erreur interne |

### `GET /status` - Statut détaillé

Informations complètes sur l'état de l'agent.

### `GET /tables` - Tables autorisées

Liste des tables accessibles pour les requêtes.

---

## 🔒 Sécurité

### Protection SQL Injection

L'agent valide **toutes** les requêtes SQL avant exécution :

| Vérification | Description |
|--------------|-------------|
| ✅ SELECT only | Seules les requêtes SELECT sont autorisées |
| ✅ Whitelist tables | Seules les tables configurées sont accessibles |
| ✅ No write keywords | INSERT, UPDATE, DELETE, DROP, etc. sont bloqués |
| ✅ No comments | `--` et `/* */` sont bloqués |
| ✅ No multi-statement | Le `;` est bloqué (pas de requêtes multiples) |
| ✅ TOP limit | Maximum 1000 lignes par requête |
| ✅ Timeout | 5 secondes max par requête |
| ✅ Rate limiting | 10 requêtes/minute |

### Tables Autorisées par Défaut

```yaml
security:
  allowed_tables:
    - F_DOCENTETE      # En-têtes documents (factures, BL, etc.)
    - F_DOCLIGNE       # Lignes documents
    - F_COMPTET        # Comptes tiers (clients/fournisseurs)
    - F_ECRITUREC      # Écritures comptables
    - F_COMPTEG        # Comptes généraux
    - F_BANQUE         # Banques
    - F_REGLECH        # Règlements
    - F_PIECE          # Pièces comptables
```

### Credentials

⚠️ **Les credentials Sage ne quittent JAMAIS le serveur client.**

- Stockés localement dans `config.yaml`
- Le fichier doit avoir des permissions restrictives (600)
- Utilisez un compte SQL Server **READ-ONLY**

```sql
-- Script création utilisateur lecture seule
CREATE LOGIN [insightsage_reader] WITH PASSWORD = 'VotreMotDePasseComplexe!';
USE [VOTRE_BASE_SAGE];
CREATE USER [insightsage_reader] FOR LOGIN [insightsage_reader];
EXEC sp_addrolemember 'db_datareader', 'insightsage_reader';
```

---

## ⚙️ Configuration Complète

```yaml
# config/config.yaml

# Connexion SQL Server Sage
sage:
  host: "192.168.1.10"              # IP ou hostname
  port: 1433                         # Port SQL Server (défaut: 1433)
  database: "SAGE_COMPANY"           # Nom de la base
  username: "insightsage_reader"     # Utilisateur lecture seule
  password: "VotreMotDePasse"        # Mot de passe
  driver: "ODBC Driver 17 for SQL Server"
  type: "100"                        # "100" ou "X3"
  version: "v12"                     # Version Sage

# Communication backend SaaS
backend:
  url: "https://api.insightsage.com" # URL backend (ne pas modifier)
  agent_token: "votre-token-ici"     # Token fourni à l'onboarding
  heartbeat_interval: 30             # Secondes entre heartbeats

# Sécurité
security:
  allowed_tables:                    # Tables accessibles
    - F_DOCENTETE
    - F_DOCLIGNE
    - F_COMPTET
    - F_ECRITUREC
    - F_COMPTEG
    - F_BANQUE
    - F_REGLECH
    - F_PIECE
  max_rows: 1000                     # Limite lignes par requête
  query_timeout: 5                   # Timeout en secondes
  rate_limit: 10                     # Requêtes par minute

# Agent
agent:
  name: "InsightSage-Agent-01"       # Nom unique de l'agent
  port: 8080                         # Port local
  log_level: "INFO"                  # DEBUG, INFO, WARNING, ERROR
  log_dir: "./logs"                  # Dossier des logs
```

---

## 🛠️ Commandes Utiles

### Développement

```bash
# Démarrer en mode dev
python -m src.main

# Démarrer avec config spécifique
python -m src.main -c /chemin/vers/config.yaml

# Démarrer sur un port différent
python -m src.main -p 9090

# Lancer les tests
pytest tests/ -v
```

### Service Windows

```powershell
# Statut
sc query InsightSageAgent

# Arrêter
nssm stop InsightSageAgent

# Démarrer
nssm start InsightSageAgent

# Redémarrer
nssm restart InsightSageAgent

# Désinstaller
nssm remove InsightSageAgent confirm
```

### Service Linux

```bash
# Statut
systemctl status insightsage-agent

# Logs en temps réel
journalctl -u insightsage-agent -f

# Arrêter
systemctl stop insightsage-agent

# Démarrer
systemctl start insightsage-agent

# Redémarrer
systemctl restart insightsage-agent

# Désinstaller
systemctl disable insightsage-agent
rm /etc/systemd/system/insightsage-agent.service
systemctl daemon-reload
```

### Générer l'exécutable Windows

```bash
# Installer PyInstaller
pip install pyinstaller

# Générer l'exe
pyinstaller build.spec

# L'exécutable sera dans dist/InsightSageAgent.exe
```

---

## 🔍 Dépannage

### Problème de connexion SQL Server

```bash
# Vérifier la connectivité
telnet 192.168.1.10 1433

# Vérifier le driver ODBC
odbcinst -q -d
```

**Solution :** Installer le driver ODBC 17 :
- Windows : [Téléchargement Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
- Linux : 
```bash
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
apt-get update && apt-get install -y msodbcsql17
```

### Agent ne démarre pas

1. Vérifier les logs : `logs/agent_YYYY-MM-DD.log`
2. Vérifier la configuration YAML
3. Tester la connexion SQL manuellement

### Heartbeat échoue

1. Vérifier l'accès Internet (port 443 sortant)
2. Vérifier le token agent
3. Vérifier les logs pour les erreurs HTTP

### Rate limit atteint

Le rate limit est de 10 requêtes/minute. Si vous avez besoin de plus :
1. Contactez le support InsightSage
2. Modifiez temporairement `security.rate_limit` dans config.yaml

---

## 📊 Monitoring

### Endpoints de monitoring

- `GET /ping` - Health check complet
- `GET /health` - Health check simple (pour load balancers)
- `GET /status` - Statut détaillé

### Logs

Les logs sont dans `logs/agent_YYYY-MM-DD.log` avec rotation automatique.

Niveaux disponibles : `DEBUG`, `INFO`, `WARNING`, `ERROR`

### Intégration monitoring externe

L'endpoint `/health` peut être utilisé avec :
- Nagios
- Zabbix
- Prometheus (via blackbox exporter)
- UptimeRobot

---

## 📝 Changelog

### v1.0.0 (Initial Release)
- ✅ Connexion Sage 100 / X3 via ODBC
- ✅ Endpoint `/execute_sql` sécurisé
- ✅ Validation SQL (whitelist, SELECT only, TOP limit)
- ✅ Rate limiting (10 req/min)
- ✅ Heartbeat automatique vers backend
- ✅ Service Windows (NSSM)
- ✅ Service Linux (systemd)
- ✅ Génération exécutable Windows

---

## 🆘 Support

- **Documentation** : https://docs.insightsage.com/agent
- **Email** : support@insightsage.com
- **Issues** : https://github.com/insightsage/agent/issues

---

**© 2026 InsightSage - All Rights Reserved**
