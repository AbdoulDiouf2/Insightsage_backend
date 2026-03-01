@echo off
REM Installation du service Windows InsightSage Agent
REM Doit être exécuté en tant qu'Administrateur

echo ===================================================
echo   InsightSage Agent - Installation Service Windows
echo ===================================================
echo.

REM Vérifier les privilèges admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERREUR: Ce script doit etre execute en tant qu'Administrateur.
    echo Clic droit sur le fichier et "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

REM Définir les variables
set SERVICE_NAME=InsightSageAgent
set DISPLAY_NAME=InsightSage Agent
set DESCRIPTION=Agent On-Premise pour connexion securisee a Sage
set AGENT_DIR=%~dp0..
set PYTHON_EXE=%AGENT_DIR%\venv\Scripts\python.exe
set AGENT_SCRIPT=%AGENT_DIR%\src\main.py

REM Vérifier que Python est installé
if not exist "%PYTHON_EXE%" (
    echo ERREUR: Python non trouve dans le venv.
    echo Executez d'abord: python -m venv venv && venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

REM Vérifier la configuration
if not exist "%AGENT_DIR%\config\config.yaml" (
    echo ERREUR: Fichier de configuration non trouve.
    echo Copiez config.example.yaml vers config.yaml et configurez-le.
    pause
    exit /b 1
)

REM Installer NSSM si nécessaire (Non-Sucking Service Manager)
where nssm >nul 2>&1
if %errorLevel% neq 0 (
    echo NSSM non trouve. Telechargement...
    powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
    powershell -Command "Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force"
    copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "C:\Windows\System32\nssm.exe"
    echo NSSM installe.
)

REM Arrêter le service existant s'il existe
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo Arret du service existant...
    nssm stop %SERVICE_NAME%
    nssm remove %SERVICE_NAME% confirm
)

REM Installer le service
echo Installation du service...
nssm install %SERVICE_NAME% "%PYTHON_EXE%" -m src.main
nssm set %SERVICE_NAME% AppDirectory "%AGENT_DIR%"
nssm set %SERVICE_NAME% DisplayName "%DISPLAY_NAME%"
nssm set %SERVICE_NAME% Description "%DESCRIPTION%"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppStdout "%AGENT_DIR%\logs\service_stdout.log"
nssm set %SERVICE_NAME% AppStderr "%AGENT_DIR%\logs\service_stderr.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760

REM Démarrer le service
echo Demarrage du service...
nssm start %SERVICE_NAME%

echo.
echo ===================================================
echo   Installation terminee!
echo ===================================================
echo.
echo Le service %SERVICE_NAME% est maintenant installe et demarre.
echo.
echo Commandes utiles:
echo   - Statut:   sc query %SERVICE_NAME%
echo   - Arreter:  nssm stop %SERVICE_NAME%
echo   - Demarrer: nssm start %SERVICE_NAME%
echo   - Logs:     %AGENT_DIR%\logs\
echo.
pause
