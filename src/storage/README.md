# Module Storage (Hybride)

Service centralisé pour la gestion des fichiers et des médias, supportantCloudflare R2 et une gestion locale de repli.

## Stratégie de Stockage
Le service utilise une logique de **Prendre le meilleur, repli sur le stable** :
1. **Cloudflare R2 (S3)** : Utilisé si les variables d'environnement `R2_*` sont renseignées. C'est le stockage recommandé pour la scalabilité.
2. **Local Fallback** : Si R2 n'est pas configuré ou en cas de panne, les fichiers sont écrits dans `UPLOAD_DIR` via `fs-extra`.

## Méthodes Clés
- `uploadFile(file, folder)` : Stocke un fichier dans le dossier spécifié (par défaut `temp`).
- `confirmUploads(urls, bugId)` : Déplace et renomme les fichiers d'un état temporaire vers un dossier permanent propre.

## Configuration requise
Consultez le `.env.example` à la racine pour les variables `UPLOAD_DIR`, `APP_URL` et `R2_*`.
