# Cockpit Desktop — Intégration Tauri

Guide complet pour transformer l'application web Cockpit en application desktop native Windows (et cross-platform) avec **Tauri v2**.

---

## Table des matières

1. [Pourquoi Tauri ?](#1-pourquoi-tauri)
2. [Architecture](#2-architecture)
3. [Prérequis système](#3-prérequis-système)
4. [Installation et setup initial](#4-installation-et-setup-initial)
5. [Structure du projet après intégration](#5-structure-du-projet-après-intégration)
6. [Configuration `tauri.conf.json`](#6-configuration-tauriconfjson)
7. [Scripts disponibles](#7-scripts-disponibles)
8. [Considérations spécifiques Cockpit](#8-considérations-spécifiques-cockpit)
9. [Fonctionnalités Tauri recommandées](#9-fonctionnalités-tauri-recommandées)
10. [Workflow de développement](#10-workflow-de-développement)
11. [Build et distribution Windows](#11-build-et-distribution-windows)
12. [CI/CD GitHub Actions](#12-cicd-github-actions)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Pourquoi Tauri ?

### Contexte

Le client (DAF) souhaite une **version desktop installable** de Cockpit pour Windows. Trois options ont été évaluées :

| Critère | PWA | Electron | **Tauri** |
|---|---|---|---|
| Poids de l'app | ~1MB | ~200MB | **~5-10MB** |
| Nécessite un navigateur | Oui | Non (Chromium embarqué) | **Non (WebView2)** |
| Accès système (fichiers, OS) | Limité | Oui | **Oui** |
| Sécurité | Moyenne | Moyenne | **Haute (sandbox Rust)** |
| Compatibilité React + Vite | Oui | Oui | **Oui (zero rewrite)** |
| Mises à jour auto | Native | electron-updater | **tauri-plugin-updater** |
| Notifications OS | Limitées | Oui | **Oui** |
| System Tray | Non | Oui | **Oui** |
| Effort d'intégration | Très faible | Moyen | **Faible** |

### Pourquoi Tauri est le bon choix pour Cockpit

- **Aucune réécriture** — le frontend React + Vite existant fonctionne tel quel dans la WebView Tauri
- **App légère** — critique pour les postes en entreprise souvent contraints
- **Sécurité renforcée** — backend Rust avec sandbox stricte, sans Node.js embarqué (contrairement à Electron). Pertinent pour une app manipulant des données financières sensibles
- **Expérience desktop professionnelle** — icône sur le bureau, barre des tâches, notifications Windows, tray icon
- **Pas de navigateur requis** — le DAF n'a pas besoin d'ouvrir Chrome pour accéder au cockpit

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                 Application Desktop              │
│                                                  │
│   ┌─────────────────────────────────────────┐   │
│   │         Frontend React (WebView2)        │   │
│   │                                          │   │
│   │  • Tous les composants existants         │   │
│   │  • Socket.io → /cockpit WebSocket        │   │
│   │  • Axios → API backend NestJS            │   │
│   │  • JWT stocké en localStorage            │   │
│   └──────────────┬──────────────────────────┘   │
│                  │  IPC Bridge (Tauri)            │
│   ┌──────────────▼──────────────────────────┐   │
│   │         Backend Rust (Tauri Core)        │   │
│   │                                          │   │
│   │  • Gestion fenêtre native                │   │
│   │  • System Tray                           │   │
│   │  • Notifications OS                      │   │
│   │  • Auto-updater                          │   │
│   │  • Accès fichiers système (si besoin)    │   │
│   └──────────────┬──────────────────────────┘   │
│                  │                               │
│         Windows / macOS / Linux                  │
└─────────────────────────────────────────────────┘
                   │
                   │ HTTPS / WSS
                   ▼
       ┌───────────────────────┐
       │  Backend NestJS       │
       │  (cloud ou on-prem)   │
       └───────────────────────┘
```

### Ce qui change vs la version web

- **Côté frontend** : rien. `src/` reste identique à 100%.
- **Ajout** : dossier `src-tauri/` contenant le code Rust de l'app native.
- **Variables d'env** : `VITE_API_URL` pointe vers le backend de prod (pas localhost).
- **Proxy Vite** : actif seulement en mode `tauri dev`, inactif en production.

---

## 3. Prérequis système

### Déjà en place

- Node.js >= 18
- Yarn (gestionnaire de paquets du projet)

### À installer

#### Windows (obligatoire)

**1. Rust (via rustup)**

```bash
# Télécharger et exécuter rustup-init.exe depuis :
# https://rustup.rs/
rustup default stable
rustup update
```

Vérification :
```bash
rustc --version   # rustc 1.78.0 (ou supérieur)
cargo --version   # cargo 1.78.0 (ou supérieur)
```

**2. Microsoft C++ Build Tools (MSVC)**

Requis pour compiler le code Rust sous Windows.

- Télécharger **Visual Studio Build Tools** depuis Microsoft
- Dans l'installeur, sélectionner : **"Développement Desktop en C++"**
- Composants requis : MSVC v143, Windows 11 SDK

**3. WebView2 Runtime**

Préinstallé sur :
- Windows 11 (toutes versions)
- Windows 10 version 1803+ (maj automatiques Microsoft)

Si absent (postes anciens ou hors ligne) : télécharger le runtime WebView2 sur le site Microsoft.

#### macOS (optionnel, si build multi-plateforme)

```bash
xcode-select --install
```

#### Linux (optionnel)

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

---

## 4. Installation et setup initial

> **Note :** Ces commandes sont à exécuter **une seule fois** pour initialiser Tauri dans le projet.

### Étape 1 — Ajouter les dépendances Tauri

```bash
cd c:/PROJETS_EQUIPE/Cockpit/Ressources/Client-cockpit

# CLI Tauri (devDependency)
yarn add -D @tauri-apps/cli

# API JavaScript Tauri (pour appeler les commandes Rust depuis React)
yarn add @tauri-apps/api
```

### Étape 2 — Initialiser le projet Tauri

```bash
yarn tauri init
```

L'assistant pose plusieurs questions. Voici les réponses pour Cockpit :

```
What is your app name?
  → Cockpit

What should the window title be?
  → Cockpit — Tableau de bord financier

Where are your web assets (HTML/CSS/JS) located, relative to the "<current dir>/src-tauri/tauri.conf.json" file that will be created?
  → ../dist

What is the URL of your dev server?
  → http://localhost:5173

What is your frontend dev command?
  → yarn dev

What is your frontend build command?
  → yarn build
```

### Étape 3 — Générer les icônes

```bash
# Utilise le logo existant du projet pour générer tous les formats
yarn tauri icon "public/Logo Cockpit final-01.png"
```

Cela génère automatiquement dans `src-tauri/icons/` :
- `icon.ico` (Windows)
- `icon.png` (32x32 → 512x512)
- `icon.icns` (macOS)
- Variantes pour `AppImage`, `Square*Logo.png` (Windows Store)

### Étape 4 — Mettre à jour `.gitignore`

Ajouter à `.gitignore` :

```gitignore
# Tauri build artifacts
src-tauri/target/
```

---

## 5. Structure du projet après intégration

```
Client-cockpit/
│
├── src/                          # Frontend React (INCHANGÉ)
│   ├── api/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── types/
│   └── ...
│
├── src-tauri/                    # Backend Rust Tauri (NOUVEAU)
│   ├── Cargo.toml                # Dépendances Rust
│   ├── Cargo.lock                # Lock file Rust
│   ├── tauri.conf.json           # Configuration principale Tauri
│   ├── capabilities/
│   │   └── default.json          # Permissions IPC (sécurité)
│   ├── icons/                    # Icônes générées (toutes tailles)
│   │   ├── icon.ico
│   │   ├── icon.png
│   │   └── ...
│   ├── target/                   # Build artifacts (gitignored)
│   └── src/
│       ├── main.rs               # Point d'entrée Rust
│       └── lib.rs                # Commandes Tauri custom (IPC handlers)
│
├── public/                       # Assets statiques (inchangé)
├── docs/                         # Documentation (inchangé)
├── dist/                         # Build Vite (généré, gitignored)
│
├── package.json                  # Scripts desktop:* ajoutés
├── vite.config.ts                # Inchangé (ou mode desktop ajouté)
├── tsconfig.json                 # Inchangé
├── tailwind.config.js            # Inchangé
├── index.html                    # Inchangé
│
├── .env.dev                      # Dev web (inchangé)
├── .env.prod                     # Prod web (inchangé)
├── .env.desktop                  # NOUVEAU — env pour build desktop
│
└── TAURI.md                      # Ce fichier
```

---

## 6. Configuration `tauri.conf.json`

Fichier : `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Cockpit",
  "version": "1.0.0",
  "identifier": "tech.nafaka.cockpit",
  "build": {
    "beforeDevCommand": "yarn dev",
    "beforeBuildCommand": "yarn build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Cockpit — Tableau de bord financier",
        "width": 1400,
        "height": 900,
        "minWidth": 1280,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "center": true,
        "visible": false
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ],
    "windows": {
      "digestAlgorithm": "sha256",
      "certificateThumbprint": null,
      "timestampUrl": "",
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      },
      "nsis": {
        "installMode": "currentUser"
      }
    },
    "resources": [],
    "copyright": "© 2026 Nafaka Tech",
    "category": "Finance",
    "shortDescription": "Tableau de bord financier Cockpit",
    "longDescription": "Application desktop Cockpit pour DAF et contrôleurs financiers. Connectée à votre agent Sage on-premise via WebSocket sécurisé."
  },
  "plugins": {}
}
```

### Points clés de configuration

| Paramètre | Valeur | Explication |
|---|---|---|
| `identifier` | `tech.nafaka.cockpit` | Identifiant unique reverse-domain |
| `minWidth/minHeight` | 1280x768 | Taille minimale pour le dashboard drag-and-drop |
| `visible: false` | — | La fenêtre apparaît une fois React chargé (évite le flash blanc) |
| `downloadBootstrapper` | — | Télécharge WebView2 si absent (pour vieux Windows 10) |
| `installMode: currentUser` | — | Pas besoin de droits admin pour installer |

---

## 7. Scripts disponibles

### Mise à jour de `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",

    "tauri": "tauri",
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build",
    "desktop:build:debug": "tauri build --debug"
  }
}
```

### Description des commandes desktop

| Commande | Usage |
|---|---|
| `yarn desktop:dev` | Lance Vite + Tauri en parallèle. Hot reload actif. DevTools accessibles. |
| `yarn desktop:build` | Build Vite + compile Rust + génère les installers. Long (3-5 min première fois). |
| `yarn desktop:build:debug` | Idem mais avec symboles de debug. DevTools accessibles en production. |

---

## 8. Considérations spécifiques Cockpit

### 8.1 Variable d'environnement `VITE_API_URL`

En mode web, l'app pointe vers `http://localhost:3000/api` (dev) ou le backend déployé (prod).

En mode **desktop**, la notion de "localhost" disparaît — l'app doit pointer directement vers le backend de production.

**Créer `.env.desktop` à la racine :**

```env
VITE_API_URL=https://api.votre-domaine.com/api
VITE_ENV=desktop
```

**Modifier `vite.config.ts` pour charger ce fichier en mode desktop :**

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // En mode desktop (tauri), charger .env.desktop
  const envFile = mode === 'desktop' ? '.env.desktop' : undefined
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
```

Et dans `tauri.conf.json`, mettre à jour `beforeBuildCommand` :

```json
"beforeBuildCommand": "vite build --mode desktop"
```

> **Important :** Ne jamais committer `.env.desktop` avec une URL de production. L'ajouter à `.gitignore` ou utiliser des variables d'environnement CI.

### 8.2 WebSocket Socket.io (`/cockpit`)

**Aucun changement requis.** WebView2 supporte nativement les WebSockets.

Le hook `use-socket.ts` existant fonctionne tel quel :

```typescript
// src/hooks/use-socket.ts — INCHANGÉ
// Socket.io-client se connecte directement à VITE_API_URL (sans proxy en prod)
```

> **Attention :** En production desktop, le Socket.io se connecte à `https://api.votre-domaine.com` directement (pas via le proxy Vite). Vérifier que le backend autorise les connexions WebSocket depuis l'origine de l'app Tauri.

### 8.3 JWT et `localStorage`

**Aucun changement requis.** WebView2 supporte `localStorage` nativement.

L'`AuthContext` existant fonctionne sans modification.

**Amélioration future (optionnelle) :** Migrer le stockage JWT vers `tauri-plugin-store` pour un stockage natif chiffré :

```bash
yarn add @tauri-apps/plugin-store
```

```typescript
// Exemple de migration (NON requis pour le MVP)
import { Store } from '@tauri-apps/plugin-store'
const store = new Store('.cockpit.dat') // fichier chiffré natif
await store.set('accessToken', token)
await store.save()
```

### 8.4 Proxy Vite

| Mode | Comportement |
|---|---|
| `yarn desktop:dev` | Le proxy Vite est actif. Les appels `/api` → `http://localhost:3000` |
| `yarn desktop:build` | Pas de proxy. `VITE_API_URL` doit être l'URL complète du backend |

### 8.5 Icônes de l'application

Le projet contient déjà plusieurs fichiers logo dans `public/`. Pour générer toutes les icônes Tauri :

```bash
# Depuis la racine du projet (Client-cockpit/)
yarn tauri icon "public/Logo Cockpit final-01.png"
```

> Prérequis : le fichier source doit être au minimum **1024x1024px** en PNG avec fond transparent ou blanc. Si le logo actuel est insuffisant, utiliser un outil de vectorisation ou demander au designer un export haute résolution.

---

## 9. Fonctionnalités Tauri recommandées

### 9.1 System Tray — Priorité HAUTE

Icône Cockpit dans la barre système Windows (zone de notification, en bas à droite).

**Valeur pour le DAF :** Accès instantané à Cockpit sans chercher le raccourci. Menu contextuel affichant le statut de l'agent on-premise en temps réel.

**Installation :**

```bash
# Pas de plugin supplémentaire requis — inclus dans Tauri core
```

**Code Rust (`src-tauri/src/lib.rs`) :**

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "Quitter Cockpit", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Ouvrir Cockpit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Cockpit — Tableau de bord financier")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

> **Note :** Configurer `"closeRequestedEvent": true` dans `tauri.conf.json` pour que la croix ferme dans le tray plutôt que de quitter l'app.

### 9.2 Notifications OS — Priorité HAUTE

Notifications Windows natives (toast notifications) — visibles même si Cockpit est en arrière-plan ou dans le tray.

**Cas d'usage Cockpit :**
- Agent on-premise passe offline
- Token agent expiré ou sur le point d'expirer
- Synchronisation terminée

**Installation :**

```bash
yarn add @tauri-apps/plugin-notification
```

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-notification = "2"
```

**Enregistrement dans `lib.rs` :**

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // ...
}
```

**Utilisation côté React (ex: dans `use-socket.ts`) :**

```typescript
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

async function notifyAgentOffline(agentName: string) {
  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    const permission = await requestPermission()
    permissionGranted = permission === 'granted'
  }
  if (permissionGranted) {
    sendNotification({
      title: 'Agent hors ligne',
      body: `L'agent "${agentName}" ne répond plus. Vérifiez la connexion.`,
      icon: 'icons/icon.png',
    })
  }
}
```

> **Intégration suggérée :** Appeler `notifyAgentOffline()` dans le listener Socket.io `agent_log` quand le statut passe à `OFFLINE`. Vérifier si on est en contexte Tauri avec `window.__TAURI__` avant d'appeler le plugin.

### 9.3 Auto-updater — Priorité MOYENNE

Mise à jour silencieuse de l'application desktop.

**Installation :**

```bash
yarn add @tauri-apps/plugin-updater
```

```toml
# Cargo.toml
[dependencies]
tauri-plugin-updater = "2"
```

**Configuration dans `tauri.conf.json` :**

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://api.votre-domaine.com/desktop/updates/{{target}}/{{arch}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "VOTRE_CLE_PUBLIQUE_ED25519"
    }
  }
}
```

**Endpoint de mise à jour (côté NestJS) :** Retourne un JSON avec `version`, `notes`, et `platforms` (URLs des installers signés).

> Nécessite de générer une paire de clés `tauri signer generate` et d'héberger les releases signées.

### 9.4 Deep Links — Priorité BASSE

Protocole custom `cockpit://` pour les liens email (reset password, invitation).

```bash
yarn add @tauri-apps/plugin-deep-link
```

```json
// tauri.conf.json
"plugins": {
  "deep-link": {
    "schemes": ["cockpit"]
  }
}
```

Exemple : `cockpit://reset-password/TOKEN` → ouvre directement la page de reset dans l'app desktop, sans navigateur.

---

## 10. Workflow de développement

### Démarrage en mode développement

```bash
yarn desktop:dev
```

Ce que cette commande fait :
1. Lance `yarn dev` (Vite sur `http://localhost:5173`)
2. Compile le code Rust (`src-tauri/`)
3. Ouvre une fenêtre native avec la WebView pointant vers Vite
4. Hot reload actif — les modifications React sont reflétées instantanément

**DevTools :** Clic droit → "Inspecter l'élément" (comme dans Chrome).

**Premier démarrage :** La compilation Rust prend 2-5 minutes. Les suivants sont rapides (cache).

### Debugger l'IPC Tauri (Rust → React)

```bash
# Logs Rust dans le terminal
RUST_LOG=debug yarn desktop:dev
```

### Tests

Les tests Vitest existants restent inchangés (ils testent le frontend indépendamment de Tauri) :

```bash
yarn test:run
```

---

## 11. Build et distribution Windows

### Générer les installers

```bash
yarn desktop:build
```

Durée : 3-8 minutes (première fois, cache Rust ensuite).

### Fichiers générés

Chemin : `src-tauri/target/release/bundle/`

```
bundle/
├── msi/
│   └── Cockpit_1.0.0_x64_en-US.msi      # Windows Installer (MSI)
└── nsis/
    └── Cockpit_1.0.0_x64-setup.exe       # Installeur NSIS
```

| Installeur | Usage recommandé |
|---|---|
| `.msi` | Déploiement en entreprise, GPO Active Directory, SCCM |
| `.exe` (NSIS) | Installation utilisateur final, pas de droits admin requis |

### Options d'installation WebView2

Configurer dans `tauri.conf.json` selon l'environnement client :

```json
"webviewInstallMode": {
  "type": "downloadBootstrapper"
}
```

| Type | Comportement | Usage |
|---|---|---|
| `downloadBootstrapper` | Télécharge WebView2 si absent | Client avec accès internet |
| `embedBootstrapper` | Embarque l'installeur WebView2 (~1.5MB) | Client avec accès limité |
| `offlineInstaller` | Embarque WebView2 complet (~150MB) | Client hors ligne total |
| `fixedRuntime` | Utilise une version fixée de WebView2 | Environnement contrôlé |
| `skip` | Ne gère pas WebView2 | WebView2 déjà déployé par GPO |

### Code Signing (signature du code)

**Sans signature :** Windows SmartScreen affiche un avertissement "application inconnue". Acceptable pour les phases de développement et pilote.

**Avec signature (recommandé pour production) :**

1. Acquérir un certificat **EV Code Signing** (DigiCert, Sectigo, ~300€/an)
2. Configurer dans `tauri.conf.json` :

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "THUMBPRINT_DU_CERTIFICAT",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

3. Les variables sensibles via variables d'environnement :

```env
TAURI_SIGNING_PRIVATE_KEY=...
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...
```

### Versioning

Mettre à jour `version` dans `tauri.conf.json` à chaque release :

```json
{
  "version": "1.1.0"
}
```

> Synchroniser avec `version` dans `package.json`.

---

## 12. CI/CD GitHub Actions

Exemple de workflow pour builder automatiquement sur toutes les plateformes :

```yaml
# .github/workflows/desktop-release.yml
name: Build Desktop App

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        platform: [windows-latest, macos-latest, ubuntu-22.04]

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Install frontend dependencies
        run: yarn install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          VITE_API_URL: ${{ secrets.VITE_API_URL_PROD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Cockpit Desktop v__VERSION__'
          releaseBody: 'Nouvelle version de l''application Cockpit Desktop'
          releaseDraft: true
```

Ce workflow :
1. Se déclenche sur un tag `v*` (ex: `v1.1.0`)
2. Build en parallèle sur Windows, macOS et Linux
3. Crée une GitHub Release draft avec les installers en pièces jointes

---

## 13. Troubleshooting

### `error: linker 'link.exe' not found`

**Cause :** Microsoft C++ Build Tools non installés ou mal configurés.

**Solution :**
```bash
# Vérifier que MSVC est dans le PATH
where link.exe

# Sinon, réinstaller Visual Studio Build Tools
# et sélectionner "Développement Desktop en C++"
```

### Fenêtre blanche (blank screen) au démarrage

**Cause :** Vite n'est pas encore démarré quand Tauri tente de charger la WebView.

**Solution :** `yarn desktop:dev` gère ce timing automatiquement. En cas de problème persistant, augmenter le délai dans `tauri.conf.json` :

```json
"app": {
  "windows": [
    {
      "visible": false
    }
  ]
}
```

Et afficher la fenêtre côté React quand l'app est prête (via l'événement Tauri `ready`).

### `WebView2 is not installed`

**Cause :** Poste Windows 10 ancien sans WebView2.

**Solution :** Télécharger le Microsoft Edge WebView2 Runtime, ou utiliser `embedBootstrapper` dans la config bundle.

### `VITE_API_URL` est vide ou pointe vers localhost

**Cause :** Mauvais fichier `.env` chargé lors du build.

**Solution :**
```bash
# S'assurer que le mode vite est bien "desktop"
vite build --mode desktop

# Et que .env.desktop existe et contient VITE_API_URL
cat .env.desktop
```

### `Socket.io connection refused` en production

**Cause :** Le backend n'autorise pas les connexions WebSocket depuis l'origine Tauri.

**Solution :** Dans la config CORS du backend NestJS, ajouter l'origine Tauri :

```typescript
// insightsage_backend/src/main.ts
app.enableCors({
  origin: [
    'http://localhost:5173',         // dev web
    'https://votre-domaine.com',     // prod web
    'tauri://localhost',             // desktop dev
    'https://tauri.localhost',       // desktop prod
  ],
  credentials: true,
});
```

### Rust compile mais l'app crash au démarrage

**Solution :** Lancer en mode debug pour voir les logs :

```bash
yarn desktop:build:debug
# Puis lancer l'exe depuis src-tauri/target/debug/
```

### `Cannot find module '@tauri-apps/api'`

**Cause :** Package non installé.

```bash
yarn add @tauri-apps/api
```

---

## Références

- [Documentation officielle Tauri v2](https://v2.tauri.app/)
- [tauri-apps/create-tauri-app](https://github.com/tauri-apps/create-tauri-app)
- [Guide migration Tauri v1 → v2](https://v2.tauri.app/start/migrate/from-tauri-1/)
- [tauri-plugin-notification](https://v2.tauri.app/plugin/notification/)
- [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/)
- [tauri-plugin-store](https://v2.tauri.app/plugin/store/)

---

*Document rédigé le 2026-04-07 — Nafaka Tech / Projet Cockpit v1.1 MVP*
