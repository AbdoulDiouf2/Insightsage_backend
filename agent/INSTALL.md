# InsightSage Agent - Guide d'Installation Rapide

## 🚀 Installation en 5 minutes

### 1. Prérequis

- Python 3.10+
- ODBC Driver 17 for SQL Server
- Accès réseau au serveur Sage (SQL Server)
- Accès Internet sortant (HTTPS)

### 2. Installation

```bash
# Cloner le projet
git clone <repo>
cd agent

# Windows
start.bat

# Linux
chmod +x start.sh && ./start.sh
```

### 3. Configuration

```bash
# Copier le template
cp config/config.example.yaml config/config.yaml

# Éditer avec vos paramètres
# - sage.host : IP du serveur SQL Server
# - sage.database : Nom de la base Sage
# - sage.username : Utilisateur lecture seule
# - sage.password : Mot de passe
# - backend.agent_token : Token fourni lors de l'onboarding
```

### 4. Tester

```bash
# Tester la connexion
python scripts/test_connection.py

# Si OK, démarrer l'agent
python -m src.main
```

### 5. Installer en service

```bash
# Windows (Admin)
scripts\install_service.bat

# Linux (root)
sudo scripts/install_service.sh
```

### 6. Vérifier

```bash
curl http://localhost:8080/ping
```

---

## 🔧 Commandes utiles

| Action | Windows | Linux |
|--------|---------|-------|
| Démarrer | `start.bat` | `./start.sh` |
| Tester connexion | `python scripts/test_connection.py` | idem |
| Statut service | `sc query InsightSageAgent` | `systemctl status insightsage-agent` |
| Logs | `logs/agent_*.log` | `journalctl -u insightsage-agent` |

---

## ❓ Problèmes courants

**"ODBC Driver not found"** → Installer ODBC Driver 17

**"Connection refused"** → Vérifier IP/port SQL Server

**"Login failed"** → Vérifier credentials SQL

**"Table not allowed"** → Ajouter la table dans `security.allowed_tables`

---

Documentation complète : [README.md](README.md)
