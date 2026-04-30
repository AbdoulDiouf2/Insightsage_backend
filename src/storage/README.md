# StorageModule — Stockage objet (MinIO self-hosted)

Service centralisé de gestion des fichiers via **MinIO self-hosted** (S3-compatible).
Supporte un fallback sur le système de fichiers local (`fs-extra`) si MinIO n'est pas configuré.

> **Guide d'installation MinIO** → [`docs/developer/storage-minio.md`](../../docs/developer/storage-minio.md)
> **Documentation module** → [`docs/backend/modules/storage.md`](../../docs/backend/modules/storage.md)

---

## Stratégie de stockage

| Priorité | Backend | Condition |
|---|---|---|
| **1 — Primaire** | MinIO self-hosted (S3) | Variables `R2_*` renseignées |
| **2 — Repli** | Système de fichiers local | `R2_*` absentes ou MinIO inaccessible |

---

## Configuration requise (`.env`)

```env
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=cockpit_app
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxx
R2_BUCKET_NAME=cockpit-storage
R2_PUBLIC_URL=http://localhost:9000/cockpit-storage

UPLOAD_DIR=uploads
APP_URL=http://localhost:3000
```

---

## Structure de stockage (bucket unique)

```
cockpit-storage/
├── temp/                                  ← uploads temporaires (avant confirmation)
├── bugs/
│   └── BR-20260430-001/
│       ├── BR-20260430-001_1.png          ← pièces jointes confirmées
│       └── BR-20260430-001_2.gif
└── agent-releases/
    └── 1.0.0/
        ├── windows/x64/cockpit-agent.exe
        └── linux/x64/cockpit-agent.AppImage
```

---

## Méthodes disponibles

### `uploadFile(file, folder?, customKey?)`
Upload un fichier Multer. Retourne l'URL publique.
```typescript
const url = await storageService.uploadFile(file);
// → "http://localhost:9000/cockpit-storage/temp/uuid-screenshot.png"
```

### `confirmUploads(urls, bugId)`
Déplace `temp/{file}` → `bugs/{bugId}/{bugId}_N.ext`. Appelé par BugsService.create().
```typescript
const finalUrls = await storageService.confirmUploads(tempUrls, 'BR-20260430-001');
```

### `deleteFile(fileUrl)`
Supprime depuis l'URL publique. Appelé par AgentReleasesService.deleteRelease().
```typescript
await storageService.deleteFile(fileUrl);
```

---

## Modules consommateurs

| Module | Usage |
|---|---|
| `BugsModule` | Upload images + confirmation `temp/` → `bugs/{id}/` |
| `AgentReleasesModule` | Upload exécutables dans `agent-releases/{v}/{p}/{a}/` |

---

## Créer le bucket (mc)

```powershell
& "C:\mc.exe" mb cockpit/cockpit-storage
& "C:\mc.exe" admin user add cockpit cockpit_app MON_MDP
& "C:\mc.exe" admin policy attach cockpit readwrite --user cockpit_app
```

---

## Migration locale → MinIO

Si des fichiers ont été uploadés avant l'installation de MinIO, leurs URLs en base de données pointent encore vers le serveur local. Deux étapes :

1. **Synchroniser les fichiers physiques** via `mc mirror`
2. **Mettre à jour les URLs en BDD** via l'Admin Cockpit (Paramètres → Stockage) ou l'API :
   - `GET  /admin/storage/migration-status`
   - `POST /admin/storage/migrate-local-to-minio`

> Documentation complète → [`docs/backend/modules/storage.md`](../../docs/backend/modules/storage.md#migration-locale--minio)

---

## Dépendances npm

```bash
@aws-sdk/client-s3   # déjà installé
fs-extra             # déjà installé
uuid                 # déjà installé
```
