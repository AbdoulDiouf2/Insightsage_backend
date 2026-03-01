#!/bin/bash
# Installation du service Linux InsightSage Agent
# Doit être exécuté en tant que root

set -e

echo "==================================================="
echo "  InsightSage Agent - Installation Service Linux"
echo "==================================================="
echo

# Vérifier les privilèges root
if [ "$EUID" -ne 0 ]; then
    echo "ERREUR: Ce script doit être exécuté en tant que root"
    echo "Utilisez: sudo ./install_service.sh"
    exit 1
fi

# Variables
SERVICE_NAME="insightsage-agent"
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
AGENT_USER="insightsage"
VENV_PATH="$AGENT_DIR/venv"
CONFIG_PATH="$AGENT_DIR/config/config.yaml"

# Vérifier que la configuration existe
if [ ! -f "$CONFIG_PATH" ]; then
    echo "ERREUR: Fichier de configuration non trouvé."
    echo "Copiez config.example.yaml vers config.yaml et configurez-le."
    exit 1
fi

# Créer l'utilisateur si nécessaire
if ! id "$AGENT_USER" &>/dev/null; then
    echo "Création de l'utilisateur $AGENT_USER..."
    useradd -r -s /bin/false $AGENT_USER
fi

# Installer les dépendances Python si nécessaire
if [ ! -d "$VENV_PATH" ]; then
    echo "Création de l'environnement virtuel..."
    python3 -m venv "$VENV_PATH"
    "$VENV_PATH/bin/pip" install --upgrade pip
    "$VENV_PATH/bin/pip" install -r "$AGENT_DIR/requirements.txt"
fi

# Définir les permissions
echo "Configuration des permissions..."
chown -R $AGENT_USER:$AGENT_USER "$AGENT_DIR"
chmod 600 "$CONFIG_PATH"

# Créer le dossier de logs
mkdir -p "$AGENT_DIR/logs"
chown -R $AGENT_USER:$AGENT_USER "$AGENT_DIR/logs"

# Créer le fichier systemd
echo "Création du service systemd..."
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=InsightSage Agent - Secure Sage Connector
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$AGENT_USER
Group=$AGENT_USER
WorkingDirectory=$AGENT_DIR
ExecStart=$VENV_PATH/bin/python -m src.main -c $CONFIG_PATH
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Sécurité
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$AGENT_DIR/logs

[Install]
WantedBy=multi-user.target
EOF

# Recharger systemd et démarrer le service
echo "Démarrage du service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo
echo "==================================================="
echo "  Installation terminée!"
echo "==================================================="
echo
echo "Le service $SERVICE_NAME est maintenant installé et démarré."
echo
echo "Commandes utiles:"
echo "  - Statut:   systemctl status $SERVICE_NAME"
echo "  - Logs:     journalctl -u $SERVICE_NAME -f"
echo "  - Arrêter:  systemctl stop $SERVICE_NAME"
echo "  - Démarrer: systemctl start $SERVICE_NAME"
echo "  - Redemarrer: systemctl restart $SERVICE_NAME"
echo
