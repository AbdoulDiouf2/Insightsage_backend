#!/bin/bash
# ============================================================
# InsightSage Agent - Installation Serveur Linux
# Compatible: Ubuntu Server 20.04+, Debian 11+, RHEL 8+, CentOS 8+
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     InsightSage Agent - Installation Serveur Linux        ║"
echo "║                    Version 1.0.0                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier les privilèges root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERREUR: Ce script doit être exécuté en tant que root${NC}"
    echo "Utilisez: sudo $0"
    exit 1
fi

# Détecter la distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VERSION=$VERSION_ID
else
    echo -e "${RED}Impossible de détecter la distribution Linux${NC}"
    exit 1
fi

echo -e "${GREEN}[INFO]${NC} Système détecté: $OS $VERSION"

# Variables
SERVICE_NAME="insightsage-agent"
INSTALL_DIR="/opt/insightsage-agent"
AGENT_USER="insightsage"
CONFIG_DIR="/etc/insightsage"
LOG_DIR="/var/log/insightsage"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_SRC_DIR="$(dirname "$SCRIPT_DIR")"

# ============================================================
# Étape 1: Installation des dépendances système
# ============================================================
echo -e "\n${GREEN}[1/7]${NC} Installation des dépendances système..."

# Installer Python et dépendances
if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu
    apt-get update -qq
    apt-get install -y -qq python3 python3-venv python3-pip curl unixodbc unixodbc-dev
    
    # Installer ODBC Driver pour SQL Server
    if ! odbcinst -q -d | grep -q "ODBC Driver 17"; then
        echo -e "${YELLOW}[INFO]${NC} Installation du driver ODBC SQL Server..."
        curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
        curl -fsSL https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | tee /etc/apt/sources.list.d/mssql-release.list
        apt-get update -qq
        ACCEPT_EULA=Y apt-get install -y -qq msodbcsql17
    fi
    
elif command -v yum &> /dev/null; then
    # RHEL/CentOS
    yum install -y -q python3 python3-pip curl unixODBC unixODBC-devel
    
    # Installer ODBC Driver pour SQL Server
    if ! odbcinst -q -d | grep -q "ODBC Driver 17"; then
        echo -e "${YELLOW}[INFO]${NC} Installation du driver ODBC SQL Server..."
        curl -fsSL https://packages.microsoft.com/config/rhel/8/prod.repo > /etc/yum.repos.d/mssql-release.repo
        ACCEPT_EULA=Y yum install -y -q msodbcsql17
    fi
fi

echo -e "${GREEN}[OK]${NC} Dépendances installées"

# ============================================================
# Étape 2: Créer l'utilisateur système
# ============================================================
echo -e "\n${GREEN}[2/7]${NC} Configuration de l'utilisateur système..."

if ! id "$AGENT_USER" &>/dev/null; then
    useradd -r -s /bin/false -d $INSTALL_DIR $AGENT_USER
    echo -e "${GREEN}[OK]${NC} Utilisateur $AGENT_USER créé"
else
    echo -e "${YELLOW}[INFO]${NC} Utilisateur $AGENT_USER existe déjà"
fi

# ============================================================
# Étape 3: Copier les fichiers de l'agent
# ============================================================
echo -e "\n${GREEN}[3/7]${NC} Installation des fichiers de l'agent..."

# Créer les répertoires
mkdir -p $INSTALL_DIR
mkdir -p $CONFIG_DIR
mkdir -p $LOG_DIR

# Copier les fichiers source
cp -r $AGENT_SRC_DIR/src $INSTALL_DIR/
cp $AGENT_SRC_DIR/requirements.txt $INSTALL_DIR/

# Copier la config exemple si pas de config existante
if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
    cp $AGENT_SRC_DIR/config/config.example.yaml $CONFIG_DIR/config.yaml
    echo -e "${YELLOW}[ATTENTION]${NC} Fichier de configuration créé: $CONFIG_DIR/config.yaml"
    echo -e "${YELLOW}            ${NC} Vous DEVEZ le modifier avec vos paramètres Sage!"
fi

echo -e "${GREEN}[OK]${NC} Fichiers installés dans $INSTALL_DIR"

# ============================================================
# Étape 4: Créer l'environnement virtuel Python
# ============================================================
echo -e "\n${GREEN}[4/7]${NC} Création de l'environnement Python..."

python3 -m venv $INSTALL_DIR/venv
$INSTALL_DIR/venv/bin/pip install --upgrade pip -q
$INSTALL_DIR/venv/bin/pip install -r $INSTALL_DIR/requirements.txt -q

echo -e "${GREEN}[OK]${NC} Environnement Python configuré"

# ============================================================
# Étape 5: Configurer les permissions
# ============================================================
echo -e "\n${GREEN}[5/7]${NC} Configuration des permissions..."

chown -R $AGENT_USER:$AGENT_USER $INSTALL_DIR
chown -R $AGENT_USER:$AGENT_USER $LOG_DIR
chown -R root:$AGENT_USER $CONFIG_DIR
chmod 750 $CONFIG_DIR
chmod 640 $CONFIG_DIR/config.yaml

echo -e "${GREEN}[OK]${NC} Permissions configurées"

# ============================================================
# Étape 6: Créer le service systemd
# ============================================================
echo -e "\n${GREEN}[6/7]${NC} Configuration du service systemd..."

cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=InsightSage Agent - Secure Sage Connector
Documentation=https://docs.insightsage.com/agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$AGENT_USER
Group=$AGENT_USER
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="PYTHONUNBUFFERED=1"
ExecStart=$INSTALL_DIR/venv/bin/python -m src.main -c $CONFIG_DIR/config.yaml
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Sécurité renforcée pour serveur
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=$LOG_DIR
ReadOnlyPaths=$CONFIG_DIR
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}[OK]${NC} Service systemd créé"

# ============================================================
# Étape 7: Activer et démarrer le service
# ============================================================
echo -e "\n${GREEN}[7/7]${NC} Activation du service..."

systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Ne démarrer que si la config a été modifiée
if grep -q "CHANGE_ME" $CONFIG_DIR/config.yaml 2>/dev/null || grep -q "VOTRE_TOKEN" $CONFIG_DIR/config.yaml 2>/dev/null; then
    echo -e "${YELLOW}[ATTENTION]${NC} Service NON démarré - Configuration requise!"
    echo -e "${YELLOW}            ${NC} Modifiez $CONFIG_DIR/config.yaml puis:"
    echo -e "${YELLOW}            ${NC} sudo systemctl start $SERVICE_NAME"
else
    systemctl start $SERVICE_NAME
    sleep 2
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo -e "${GREEN}[OK]${NC} Service démarré et actif"
    else
        echo -e "${RED}[ERREUR]${NC} Le service n'a pas démarré. Vérifiez les logs:"
        echo "         journalctl -u $SERVICE_NAME -n 50"
    fi
fi

# ============================================================
# Résumé
# ============================================================
echo -e "\n${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              Installation terminée!                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}Fichiers installés:${NC}"
echo "  • Agent:        $INSTALL_DIR"
echo "  • Configuration: $CONFIG_DIR/config.yaml"
echo "  • Logs:         $LOG_DIR"
echo ""
echo -e "${GREEN}Commandes utiles:${NC}"
echo "  • Status:       sudo systemctl status $SERVICE_NAME"
echo "  • Démarrer:     sudo systemctl start $SERVICE_NAME"
echo "  • Arrêter:      sudo systemctl stop $SERVICE_NAME"
echo "  • Redémarrer:   sudo systemctl restart $SERVICE_NAME"
echo "  • Logs:         sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo -e "${GREEN}Vérification:${NC}"
echo "  curl http://localhost:8080/ping"
echo ""

if grep -q "CHANGE_ME\|VOTRE_TOKEN" $CONFIG_DIR/config.yaml 2>/dev/null; then
    echo -e "${YELLOW}⚠️  PROCHAINE ÉTAPE:${NC}"
    echo "  1. Modifier la configuration: sudo nano $CONFIG_DIR/config.yaml"
    echo "  2. Démarrer le service: sudo systemctl start $SERVICE_NAME"
fi
