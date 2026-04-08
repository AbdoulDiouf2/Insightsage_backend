# Module Bug Tracker

Le module **Bug Tracker** permet de centraliser, suivre et résoudre les problèmes techniques signalés par les clients ou les administrateurs.

## Workflow de Signalement

1. **Capture d'écran** : L'utilisateur uploade une ou plusieurs images. Celles-ci sont stockées temporairement dans un dossier `temp/`.
2. **Création du Ticket** : À la soumission du formulaire, le ticket est créé avec un ID unique au format `BR-YYYYMMDD-XXX`.
3. **Promotion des Fichiers** : Le `StorageService` déplace automatiquement les fichiers de `temp/` vers un dossier définitif nommé d'après l'ID du bug. Les fichiers sont renommés `ID_INDEX.ext`.

## Stockage Hybride

Le système utilise une stratégie de stockage avec repli automatique (fallback) :

| Type | Destination | Condition |
| --- | --- | --- |
| **Principal** | **Cloudflare R2** (S3 compatible) | Si les clés `R2_*` sont configurées dans le `.env` |
| **Fallback** | **Système de fichiers local** | En cas d'absence de config R2 ou d'erreur réseau |

### Organisation des dossiers (Local)

Les fichiers locaux sont stockés dans le dossier défini par `UPLOAD_DIR` (par défaut `uploads/`).

- `uploads/temp/` : Stockage temporaire lors du remplissage du formulaire.
- `uploads/bugs/{bugId}/` : Dossier définitif par ticket.
  - `{bugId}_1.png`
  - `{bugId}_2.png`

## API Reference

### `POST /v1/bugs/upload`
Upload d'un fichier multipart vers le stockage temporaire.
**Retourne** : `url` temporaire.

### `POST /v1/bugs`
Création d'un ticket.
**Note** : Les champs `organizationId`, `entity_code` et `fiscal_year` sont optionnels pour permettre le signalement de bugs transversaux ou globaux (en sélectionnant "Non spécifié" dans l'UI). Dans ce cas, ils sont ignorés par le service.

**Body** :
```json
{
  "title": "string",
  "bug_type": ["string"],
  "module": "string",
  "priority": "string",
  "description": "string",
  "attachments": ["url1", "url2"],
  "organizationId": "uuid?",
  "entity_code": "string?",
  "fiscal_year": number?,
  "steps_to_reproduce": ["string"],
  "expected_behavior": "string",
  "actual_behavior": "string",
  "frequency": "string",
  "impact": "string",
  "url": "string",
  "browser": "string",
  "os": "string",
  "screen": "string",
  "console_errors": "string",
  "notify_emails": ["string"]
}
```

### `GET /v1/bugs`
Liste des bugs avec filtres (par organisation, statut, etc.).

## Configuration (.env)

```env
# Mandatory for local storage
UPLOAD_DIR="uploads"
APP_URL="http://localhost:3000"

# Optional (for Cloudflare R2)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```
