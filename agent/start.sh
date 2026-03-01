#!/bin/bash
# Démarrage rapide de l'agent (mode dev)

echo
echo "InsightSage Agent - Démarrage"
echo

# Vérifier si le venv existe
if [ ! -f "venv/bin/python" ]; then
    echo "Création de l'environnement virtuel..."
    python3 -m venv venv
    echo "Installation des dépendances..."
    venv/bin/pip install -r requirements.txt
fi

# Vérifier la config
if [ ! -f "config/config.yaml" ]; then
    echo
    echo "ATTENTION: Fichier de configuration manquant!"
    echo "Copiez config/config.example.yaml vers config/config.yaml"
    echo "et modifiez-le avec vos paramètres."
    exit 1
fi

# Démarrer l'agent
echo "Démarrage de l'agent..."
echo
venv/bin/python -m src.main
