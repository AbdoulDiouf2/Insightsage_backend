---
title: Guide d'installation de l'Agent
description: Installation de l'agent Cockpit via l'installeur Windows (wizard 6 étapes)
---

# Guide d'installation de l'Agent Cockpit

L'agent se distribue sous forme d'un **installeur NSIS Windows** (`Cockpit Agent Setup.exe`). Un wizard graphique en 6 étapes guide l'administrateur — aucune ligne de commande requise.

## Prérequis

| Composant | Requis | Notes |
|-----------|--------|-------|
| Système d'exploitation | Windows 10/11 ou Windows Server 2016+ | 64 bits uniquement |
| Droits | **Administrateur local** | Requis pour l'installation du service Windows |
| SQL Server | 2012+ | ODBC Driver 17 for SQL Server recommandé |
| Sage 100 | v15 minimum | v21+ recommandé |
| .NET Framework | 4.7.2+ | Requis par node-windows (WinSW) |
| Accès réseau sortant | Port **443 (HTTPS)** | Vers `api.cockpit.app` |
| Token Agent | `isag_xxx...` (48 hex) | Généré depuis le portail Cockpit → Agents |

!!! warning "Lancer en tant qu'Administrateur"
    Faites un clic droit sur `Cockpit Agent Setup.exe` → **Exécuter en tant qu'administrateur**.
    Sans ça, l'installation du service Windows échouera à l'étape 5.

---

## Wizard d'installation — 6 étapes

### Étape 1 — Bienvenue

Lecture et acceptation des Conditions Générales d'Utilisation et de la politique RGPD.

---

### Étape 2 — Connexion à la base Sage

Renseignez les paramètres SQL Server :

| Champ | Exemple | Notes |
|-------|---------|-------|
| Serveur | `MONSRV` ou `192.168.1.10` | Nom ou IP |
| Instance | `SAGE100` | Laisser vide si instance par défaut |
| Port | `1433` | Laisser vide pour défaut |
| Base de données | `BIJOU` | Nom exact de la base Sage 100 |
| Authentification | SQL Auth **ou** Windows Auth | Windows Auth recommandé si disponible |
| Utilisateur / Mot de passe | `cockpit_agent` / `***` | SQL Auth uniquement |

Cliquez **Tester la connexion** → le wizard vérifie la connectivité et affiche la version SQL Server.

**Permissions SQL requises** sur le compte utilisé :

```sql
-- Lecture sur toutes les tables Sage
GRANT SELECT ON SCHEMA::dbo TO cockpit_agent;

-- Création des vues BI (opération unique à l'installation)
ALTER ROLE db_ddladmin ADD MEMBER cockpit_agent;
```

---

### Étape 3 — Détection Sage 100

Le wizard interroge `INFORMATION_SCHEMA` pour détecter automatiquement :

- Version Sage 100 (`v21plus` / `v15v17` / `fallback`)
- Version SQL Server
- Tables Sage présentes
- Nombre d'écritures comptables

Aucune action requise — vérifiez simplement que la version détectée correspond à votre installation.

---

### Étape 4 — Déploiement des vues SQL

Le wizard déploie **12 vues BI** dans la base Sage 100 :

- `PLATEFORME_PARAMS` et `PLATEFORME_CONFIG_GROUPE` (tables de configuration agent)
- 9 vues stables (toutes versions Sage)
- 3 vues adaptées à la version détectée (`VW_STOCKS`, `VW_COMMANDES`, `VW_IMMOBILISATIONS`)

Une barre de progression affiche l'avancement vue par vue. En cas d'erreur sur une vue, le déploiement continue — les vues en erreur sont signalées à la fin.

!!! info "Idempotent"
    Le déploiement utilise `CREATE OR ALTER VIEW` — il peut être relancé sans risque si une vue doit être mise à jour.

---

### Étape 5 — Activation et installation du service

Renseignez vos identifiants Cockpit :

- **Email** : votre email de connexion au portail Cockpit
- **Token agent** : le token `isag_...` généré depuis **Portail Cockpit → Agents → Générer un token**

Le wizard effectue ensuite 5 sous-étapes avec barre de progression :

| Sous-étape | Action |
|-----------|--------|
| 1/5 | Sauvegarde du mot de passe SQL dans **Windows Credential Manager** |
| 2/5 | Écriture de `config.json` (serveur, base, agent ID) |
| 3/5 | Installation du service Windows `CockpitAgent` |
| 4/5 | Attente du démarrage (health check `http://127.0.0.1:8444/health`, timeout 30s) |
| 5/5 | Confirmation : **Service opérationnel ✓** |

!!! success "Token sécurisé"
    Le token est chiffré en AES-256-GCM avec une clé dérivée du machine ID avant stockage. Il est inutilisable si le fichier est copié sur une autre machine.

---

### Étape 6 — Installation terminée

Résumé de l'installation avec :

- Statut de chaque étape
- Machine ID de la machine installée
- Lien direct vers le **tableau de bord Cockpit**
- Lien vers le **dashboard de statut local** `http://127.0.0.1:8444/`

---

## Vérification post-installation

### Via le dashboard local

Ouvrez un navigateur sur la machine cliente :

```
http://127.0.0.1:8444/
```

Vous devez voir le badge **Opérationnel** (vert), la connexion SQL verte, et les 12 vues dans le tableau.

### Via l'API (JSON)

```powershell
Invoke-WebRequest http://127.0.0.1:8444/health | Select-Object -ExpandProperty Content
```

Réponse attendue :
```json
{
  "status": "ok",
  "sqlConnected": true,
  "platformConnected": true,
  "version": "1.0.0"
}
```

### Via le portail Cockpit

Dans **Portail Cockpit → Agents**, l'agent doit apparaître en statut `online` (vert) dans les **5 minutes** suivant l'installation (délai du premier heartbeat).

### Via les Services Windows

```powershell
sc query CockpitAgent
# Résultat attendu : STATE : 4  RUNNING
```

---

## Désinstallation

=== "Via l'installeur Windows"
    Panneau de configuration → Programmes → **Cockpit Agent** → Désinstaller

=== "Manuellement"
    ```powershell
    # Arrêter et supprimer le service
    sc stop CockpitAgent
    sc delete CockpitAgent

    # Supprimer les fichiers
    Remove-Item "C:\Users\<user>\AppData\Local\Programs\Cockpit Agent" -Recurse

    # Supprimer le credential (optionnel)
    cmdkey /delete:Cockpit-Agent
    ```

---

## Renouvellement du token (tous les 30 jours)

!!! warning "Action requise avant expiration"
    Le portail Cockpit envoie des alertes email à J-7, J-3 et J-1 avant expiration.

1. Dans **Portail Cockpit → Agents → votre agent** → **Régénérer le token**
2. Copiez le nouveau token `isag_...`
3. Relancez `Cockpit Agent Setup.exe` en tant qu'Administrateur
4. Passez directement à l'étape 5 (Activation) et saisissez le nouveau token
5. Le wizard réinstalle le service avec le nouveau token chiffré

---

## Configuration avancée

### Proxy d'entreprise

Si l'accès à `api.cockpit.app:443` passe par un proxy, configurez-le au niveau Windows :

```powershell
# PowerShell (scope système)
netsh winhttp set proxy proxy-server="http=proxy.acme.com:8080" bypass-list="*.acme.internal"
```

Le service Node.js hérite des paramètres proxy système via `HTTP_PROXY` / `HTTPS_PROXY`.

### Authentification Windows intégrée (SSPI)

Si vous choisissez **Windows Auth** à l'étape 2, le service se connectera à SQL Server avec le compte Windows sous lequel il tourne (`SYSTEM` par défaut). Assurez-vous que ce compte a les droits SELECT sur la base Sage.

Pour changer le compte du service :

```
services.msc → CockpitAgent → Propriétés → Connexion
```

### Changer le port du dashboard

Le port `8444` est défini dans `shared/constants.js`. Pour le changer, il faut reconstruire l'agent avec un nouveau `HEALTH_PORT` dans constants.js.

---

## Logs

Les logs sont dans :

```
%ProgramData%\CockpitAgent\logs\cockpit-agent-YYYY-MM-DD.log
```

Rotation quotidienne, rétention 30 jours. Niveau `DEBUG` activable avec la variable d'environnement `LOG_LEVEL=debug` dans les propriétés du service.