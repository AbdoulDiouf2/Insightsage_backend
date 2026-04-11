# Module Agent Releases

Gestion des exécutables de l'agent on-premise. Ce module permet aux superadmins de publier, versionner et supprimer les binaires proposés au téléchargement lors de l'onboarding client (étape 3).

## Endpoints

| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| `POST` | `/admin/agent-releases` | `manage:all` | Upload un exécutable (multipart) |
| `GET` | `/admin/agent-releases` | `manage:all` | Liste toutes les releases |
| `PATCH` | `/admin/agent-releases/:id/set-latest` | `manage:all` | Marque comme version active |
| `DELETE` | `/admin/agent-releases/:id` | `manage:all` | Supprime (fichier + DB) |

## Upload (multipart/form-data)

```
file      : Binary   — exécutable (exe, AppImage, pkg...)
version   : string   — "1.2.3"
platform  : string   — "windows" | "linux" | "macos"
arch      : string?  — "x64" (défaut) | "arm64"
changelog : string?  — notes de version
```

## Stockage

Les fichiers sont stockés via `StorageService` :
- **Cloudflare R2** si `R2_ENDPOINT` + `R2_BUCKET_NAME` sont configurés
- **Stockage local** (`uploads/agent-releases/`) sinon

Chemin de stockage : `agent-releases/{version}/{platform}/{arch}/{originalName}`

## Unicité isLatest

`setLatest(id)` met à jour en transaction :
1. `isLatest = false` sur tous les enregistrements de la même plateforme
2. `isLatest = true` sur l'id sélectionné

## Dépendances du module

`PrismaModule`, `StorageModule`, `LogsModule`, `AuthModule`, `UsersModule`, `RedisModule`
