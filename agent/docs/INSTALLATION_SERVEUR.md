# Installation de l'Agent InsightSage sur Serveur

Ce guide explique comment installer l'agent sur un **serveur d'entreprise** (Linux ou Windows Server) pour une disponibilité 24/7.

## 📋 Prérequis

### Réseau
- Accès au serveur SQL Server Sage (port 1433)
- Accès Internet sortant HTTPS (port 443) vers `api.insightsage.com`
- **Aucun port entrant requis** (l'agent initie toutes les connexions)

### Serveur
| Type | Version Minimum | RAM | CPU |
|------|-----------------|-----|-----|
| Ubuntu Server | 20.04 LTS | 512 MB | 1 vCPU |
| Debian | 11 | 512 MB | 1 vCPU |
| RHEL/CentOS | 8 | 512 MB | 1 vCPU |
| Windows Server | 2016 | 512 MB | 1 vCPU |
| Docker | 20.10+ | 256 MB | 0.5 vCPU |

---

## 🐧 Installation Linux Server

### Option 1 : Script automatique (Recommandé)

```bash
# Télécharger l'agent
git clone https://github.com/insightsage/agent.git /tmp/agent
cd /tmp/agent

# Lancer l'installation
sudo ./scripts/install_server_linux.sh
```

Le script :
- ✅ Installe Python et ODBC Driver
- ✅ Crée un utilisateur système `insightsage`
- ✅ Installe l'agent dans `/opt/insightsage-agent`
- ✅ Configure systemd avec sécurité renforcée
- ✅ Active le démarrage automatique

### Configuration

```bash
# Éditer la configuration
sudo nano /etc/insightsage/config.yaml

# Modifier au minimum:
# - sage.host: IP du serveur SQL Server
# - sage.database: Nom de la base Sage
# - sage.username: Utilisateur lecture seule
# - sage.password: Mot de passe
# - backend.agent_token: Token fourni par InsightSage
```

### Démarrer le service

```bash
# Démarrer
sudo systemctl start insightsage-agent

# Vérifier le status
sudo systemctl status insightsage-agent

# Voir les logs
sudo journalctl -u insightsage-agent -f
```

---

## 🪟 Installation Windows Server

### Option 1 : Script automatique (Recommandé)

1. Télécharger l'agent
2. Ouvrir PowerShell **en tant qu'Administrateur**
3. Exécuter :

```powershell
cd C:\path\to\agent
.\scripts\install_server_windows.bat
```

### Configuration

```powershell
# Éditer la configuration
notepad C:\InsightSage\Config\config.yaml
```

### Gérer le service

```powershell
# Status
sc query InsightSageAgent

# Démarrer
nssm start InsightSageAgent

# Arrêter
nssm stop InsightSageAgent

# Logs
Get-Content C:\InsightSage\Logs\agent_stderr.log -Tail 50
```

---

## 🐳 Installation Docker

Idéal pour les serveurs avec Docker déjà installé.

### Étape 1 : Préparer la configuration

```bash
# Cloner le repo
git clone https://github.com/insightsage/agent.git
cd agent

# Créer la configuration
cp config/config.example.yaml config/config.yaml
nano config/config.yaml
```

### Étape 2 : Modifier docker-compose.yml

```yaml
# Adapter l'IP de votre serveur Sage
extra_hosts:
  - "sage-server:192.168.1.10"  # ← Votre IP
```

### Étape 3 : Démarrer

```bash
# Build et démarrage
docker-compose up -d

# Vérifier les logs
docker-compose logs -f

# Status
docker-compose ps
```

### Commandes utiles

```bash
# Arrêter
docker-compose down

# Redémarrer
docker-compose restart

# Mise à jour
git pull
docker-compose up -d --build
```

---

## 🔒 Sécurité Serveur

### Firewall

```bash
# Linux (UFW)
sudo ufw allow out 443/tcp   # HTTPS vers InsightSage
sudo ufw allow out 1433/tcp  # SQL Server (si sur autre serveur)
# Aucun port entrant requis!

# Windows
netsh advfirewall firewall add rule name="InsightSage HTTPS Out" dir=out action=allow protocol=tcp remoteport=443
```

### Utilisateur SQL Server (Lecture seule)

```sql
-- Sur le serveur SQL Server Sage
CREATE LOGIN [insightsage_reader] WITH PASSWORD = 'MotDePasseComplexe!';
USE [VOTRE_BASE_SAGE];
CREATE USER [insightsage_reader] FOR LOGIN [insightsage_reader];

-- Lecture seule uniquement
EXEC sp_addrolemember 'db_datareader', 'insightsage_reader';

-- Vérifier (aucun droit d'écriture)
SELECT * FROM sys.database_permissions WHERE grantee_principal_id = USER_ID('insightsage_reader');
```

### Permissions fichiers (Linux)

```bash
# Les credentials ne doivent être lisibles que par l'agent
sudo chmod 640 /etc/insightsage/config.yaml
sudo chown root:insightsage /etc/insightsage/config.yaml
```

---

## 📊 Monitoring

### Health Check

```bash
# Vérifier que l'agent répond
curl http://localhost:8080/ping

# Réponse attendue:
{
  "status": "ok",
  "sage_connected": true,
  "backend_registered": true
}
```

### Intégration Nagios/Zabbix

```bash
# Check script
#!/bin/bash
RESPONSE=$(curl -s http://localhost:8080/health)
if [ $? -eq 0 ]; then
    echo "OK - InsightSage Agent running"
    exit 0
else
    echo "CRITICAL - InsightSage Agent not responding"
    exit 2
fi
```

### Alertes

L'agent envoie automatiquement son status au backend InsightSage.
Le DAF peut voir le status dans le dashboard :
- 🟢 **Online** : Agent fonctionnel
- 🟡 **Offline** : Pas de heartbeat depuis >2 min
- 🔴 **Error** : Plus de 5 erreurs consécutives

---

## 🔧 Dépannage

### L'agent ne démarre pas

```bash
# Vérifier les logs
sudo journalctl -u insightsage-agent -n 100

# Causes communes:
# - Configuration YAML invalide
# - ODBC Driver non installé
# - Port 8080 déjà utilisé
```

### Connexion SQL Server échoue

```bash
# Tester la connectivité
telnet <IP_SAGE_SERVER> 1433

# Vérifier le driver ODBC
odbcinst -q -d

# Tester la connexion manuellement
python3 -c "import pyodbc; print(pyodbc.drivers())"
```

### Heartbeat échoue

```bash
# Vérifier l'accès Internet
curl -I https://api.insightsage.com/api/health

# Vérifier le token
grep agent_token /etc/insightsage/config.yaml
```

---

## 📞 Support

- **Documentation** : https://docs.insightsage.com/agent
- **Email** : support@insightsage.com
- **Logs à fournir** : 
  - Linux: `journalctl -u insightsage-agent -n 500`
  - Windows: `C:\InsightSage\Logs\agent_stderr.log`
