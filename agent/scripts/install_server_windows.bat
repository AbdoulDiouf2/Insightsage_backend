@echo off
REM ============================================================
REM InsightSage Agent - Installation Windows Server
REM Compatible: Windows Server 2016, 2019, 2022
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo   InsightSage Agent - Installation Windows Server
echo   Version 1.0.0
echo ============================================================
echo.

REM Verifier les privileges admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERREUR] Ce script doit etre execute en tant qu'Administrateur.
    echo          Clic droit ^> "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

REM Variables
set SERVICE_NAME=InsightSageAgent
set DISPLAY_NAME=InsightSage Agent
set DESCRIPTION=Agent On-Premise securise pour connexion Sage
set INSTALL_DIR=C:\InsightSage\Agent
set CONFIG_DIR=C:\InsightSage\Config
set LOG_DIR=C:\InsightSage\Logs
set SCRIPT_DIR=%~dp0
set AGENT_SRC_DIR=%SCRIPT_DIR%..

echo [INFO] Installation dans: %INSTALL_DIR%
echo.

REM ============================================================
REM Etape 1: Verifier Python
REM ============================================================
echo [1/6] Verification de Python...

python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERREUR] Python n'est pas installe ou pas dans le PATH.
    echo          Telechargez Python 3.10+ depuis https://python.org
    echo          Cochez "Add Python to PATH" lors de l'installation.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [OK] Python %PYTHON_VERSION% detecte

REM ============================================================
REM Etape 2: Creer les repertoires
REM ============================================================
echo.
echo [2/6] Creation des repertoires...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [OK] Repertoires crees

REM ============================================================
REM Etape 3: Copier les fichiers
REM ============================================================
echo.
echo [3/6] Copie des fichiers de l'agent...

xcopy /E /I /Y "%AGENT_SRC_DIR%\src" "%INSTALL_DIR%\src" >nul
copy /Y "%AGENT_SRC_DIR%\requirements.txt" "%INSTALL_DIR%\" >nul

if not exist "%CONFIG_DIR%\config.yaml" (
    copy /Y "%AGENT_SRC_DIR%\config\config.example.yaml" "%CONFIG_DIR%\config.yaml" >nul
    echo [ATTENTION] Configuration creee: %CONFIG_DIR%\config.yaml
    echo             Vous DEVEZ la modifier avec vos parametres Sage!
)

echo [OK] Fichiers copies

REM ============================================================
REM Etape 4: Creer l'environnement Python
REM ============================================================
echo.
echo [4/6] Creation de l'environnement Python...

cd /d "%INSTALL_DIR%"

if exist "venv" rmdir /s /q "venv"
python -m venv venv

call venv\Scripts\activate.bat
python -m pip install --upgrade pip -q
pip install -r requirements.txt -q
call venv\Scripts\deactivate.bat

echo [OK] Environnement Python configure

REM ============================================================
REM Etape 5: Installer NSSM (Service Manager)
REM ============================================================
echo.
echo [5/6] Installation du gestionnaire de service...

where nssm >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Telechargement de NSSM...
    
    REM Telecharger NSSM
    powershell -Command "& {Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'}"
    
    REM Extraire
    powershell -Command "& {Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force}"
    
    REM Copier dans System32
    copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "C:\Windows\System32\nssm.exe" >nul
    
    echo [OK] NSSM installe
) else (
    echo [OK] NSSM deja present
)

REM ============================================================
REM Etape 6: Configurer le service Windows
REM ============================================================
echo.
echo [6/6] Configuration du service Windows...

REM Arreter et supprimer le service existant
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Suppression de l'ancien service...
    nssm stop %SERVICE_NAME% >nul 2>&1
    nssm remove %SERVICE_NAME% confirm >nul 2>&1
)

REM Creer le nouveau service
set PYTHON_EXE=%INSTALL_DIR%\venv\Scripts\python.exe
set AGENT_ARGS=-m src.main -c %CONFIG_DIR%\config.yaml

nssm install %SERVICE_NAME% "%PYTHON_EXE%" %AGENT_ARGS%
nssm set %SERVICE_NAME% AppDirectory "%INSTALL_DIR%"
nssm set %SERVICE_NAME% DisplayName "%DISPLAY_NAME%"
nssm set %SERVICE_NAME% Description "%DESCRIPTION%"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppStdout "%LOG_DIR%\agent_stdout.log"
nssm set %SERVICE_NAME% AppStderr "%LOG_DIR%\agent_stderr.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRestartDelay 10000

echo [OK] Service Windows configure

REM ============================================================
REM Demarrer le service
REM ============================================================
echo.

findstr /C:"CHANGE_ME" /C:"VOTRE_TOKEN" "%CONFIG_DIR%\config.yaml" >nul 2>&1
if %errorLevel% equ 0 (
    echo [ATTENTION] Service NON demarre - Configuration requise!
    echo             Modifiez %CONFIG_DIR%\config.yaml puis:
    echo             nssm start %SERVICE_NAME%
) else (
    echo [INFO] Demarrage du service...
    nssm start %SERVICE_NAME%
    timeout /t 3 >nul
    
    sc query %SERVICE_NAME% | findstr "RUNNING" >nul
    if %errorLevel% equ 0 (
        echo [OK] Service demarre et actif
    ) else (
        echo [ERREUR] Le service n'a pas demarre. Verifiez les logs:
        echo          %LOG_DIR%\agent_stderr.log
    )
)

REM ============================================================
REM Resume
REM ============================================================
echo.
echo ============================================================
echo                Installation terminee!
echo ============================================================
echo.
echo Fichiers installes:
echo   * Agent:        %INSTALL_DIR%
echo   * Configuration: %CONFIG_DIR%\config.yaml
echo   * Logs:         %LOG_DIR%
echo.
echo Commandes utiles:
echo   * Status:       sc query %SERVICE_NAME%
echo   * Demarrer:     nssm start %SERVICE_NAME%
echo   * Arreter:      nssm stop %SERVICE_NAME%
echo   * Redemarrer:   nssm restart %SERVICE_NAME%
echo   * Logs:         type %LOG_DIR%\agent_stderr.log
echo.
echo Verification:
echo   curl http://localhost:8080/ping
echo.

findstr /C:"CHANGE_ME" /C:"VOTRE_TOKEN" "%CONFIG_DIR%\config.yaml" >nul 2>&1
if %errorLevel% equ 0 (
    echo ================================================================
    echo   PROCHAINE ETAPE:
    echo   1. Modifier: notepad %CONFIG_DIR%\config.yaml
    echo   2. Demarrer: nssm start %SERVICE_NAME%
    echo ================================================================
)

echo.
pause
