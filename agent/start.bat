@echo off
REM Demarrage rapide de l'agent (mode dev)
echo.
echo InsightSage Agent - Demarrage
echo.

REM Verifier si le venv existe
if not exist "venv\Scripts\python.exe" (
    echo Creation de l'environnement virtuel...
    python -m venv venv
    echo Installation des dependances...
    venv\Scripts\pip install -r requirements.txt
)

REM Verifier la config
if not exist "config\config.yaml" (
    echo.
    echo ATTENTION: Fichier de configuration manquant!
    echo Copiez config\config.example.yaml vers config\config.yaml
    echo et modifiez-le avec vos parametres.
    pause
    exit /b 1
)

REM Demarrer l'agent
echo Demarrage de l'agent...
echo.
venv\Scripts\python -m src.main
