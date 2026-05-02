# Plan : GitHub Actions CI/CD — Release automatique Cockpit Agent

## Context

À chaque push sur `main`, si la version dans `package.json` a changé, le runner doit : builder l'exe Windows, créer un GitHub Release, uploader le binaire sur le backend (stockage R2), enregistrer la release dans `AgentRelease` → les clients voient la mise à jour dans le ManagementDashboard via `GET /api/v1/agent/check-update`.

---

## Ce qui existe déjà (à réutiliser)

| Fichier | Ce qui existe |
|---|---|
| `cockpit-agent/electron-builder.yml` | Config NSIS, output `dist/installer/Cockpit Agent Setup {version}.exe` |
| `cockpit-agent/package.json` | Script `build` → `build-service.js` + `build-installer.js` |
| `insightsage_backend/src/admin/agent-releases/agent-releases.service.ts` | `createRelease(file, dto, userId)` + `setLatest(id)` |
| `insightsage_backend/src/admin/agent-releases/agent-releases.controller.ts` | Upload multipart existant (réutiliser le pattern) |
| `insightsage_backend/prisma/schema.prisma:432` | Modèle `AgentRelease` (version, platform, arch, fileUrl, checksum `sha256:<hex>`, isLatest) |

---

## Bug à corriger (bloquant)

Dans `cockpit-agent/installer/main.js`, handler `app:downloadUpdate` :

Le backend stocke le checksum préfixé `sha256:abc123…`  
Le code compare actuellement le sha256 brut (hex) avec la valeur préfixée → **toujours false → mise à jour échoue toujours**.

```js
// AVANT
if (checksum && actual.toLowerCase() !== checksum.toLowerCase()) {

// APRÈS
const normalizedChecksum = checksum?.startsWith('sha256:') ? checksum.slice(7) : checksum;
if (normalizedChecksum && actual.toLowerCase() !== normalizedChecksum.toLowerCase()) {
```

---

## Approche

### 1. Backend — Nouvel endpoint CI (`POST /api/admin/agent-releases/ci-upload`)

**Problème** : L'endpoint d'upload existant requiert un JWT superadmin (TTL 15 min) — incompatible CI.  
**Solution** : Ajouter un endpoint dédié CI authentifié par `X-CI-API-Key` (secret long-durée stocké dans les env vars).

**Fichier nouveau** : `insightsage_backend/src/admin/agent-releases/ci-api-key.guard.ts`

```typescript
@Injectable()
export class CiApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-ci-api-key'];
    const expected = this.config.get<string>('CI_API_KEY');
    if (!expected || !key || key !== expected) throw new UnauthorizedException('CI API key invalide');
    return true;
  }
}
```

**Fichier modifié** : `insightsage_backend/src/admin/agent-releases/agent-releases.controller.ts`

Ajouter après les endpoints existants :
```typescript
@Public()
@UseGuards(CiApiKeyGuard)
@Post('ci-upload')
@UseInterceptors(FileInterceptor('file'))
@ApiOperation({ summary: 'Upload release depuis CI (X-CI-API-Key)' })
async ciUpload(
  @UploadedFile() file: Express.Multer.File,
  @Body() dto: CreateAgentReleaseDto,
) {
  const release = await this.agentReleasesService.createRelease(file, dto, 'ci');
  await this.agentReleasesService.setLatest(release.id);
  return release;
}
```

**Fichier modifié** : `insightsage_backend/.env.example`
```
CI_API_KEY=                 # Secret partagé avec GitHub Actions
```

---

### 2. GitHub Actions Workflow

**Fichier nouveau** : `cockpit-agent/.github/workflows/release.yml`

**Logique globale :**
1. Job léger sur `ubuntu-latest` : lit la version, vérifie si le tag `v{version}` existe → `should_release`
2. Job lourd sur `windows-latest` (conditionnel) : install → build → tag → GitHub Release → upload backend

```yaml
name: Release Cockpit Agent

on:
  push:
    branches: [main]

jobs:
  check-version:
    runs-on: ubuntu-latest
    outputs:
      should_release: ${{ steps.check.outputs.should_release }}
      version: ${{ steps.ver.outputs.version }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: ver
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
      - id: check
        run: |
          if git rev-parse "v${{ steps.ver.outputs.version }}" >/dev/null 2>&1; then
            echo "should_release=false" >> $GITHUB_OUTPUT
          else
            echo "should_release=true" >> $GITHUB_OUTPUT
          fi

  build-and-release:
    needs: check-version
    if: needs.check-version.outputs.should_release == 'true'
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install
          cd installer; npm install
          cd ../service; npm install

      - name: Build
        run: npm run build
        env:
          COCKPIT_URL: https://cockpit.nafakatech.com

      - name: Create & push tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag "v${{ needs.check-version.outputs.version }}"
          git push origin "v${{ needs.check-version.outputs.version }}"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: "v${{ needs.check-version.outputs.version }}"
          name: "Cockpit Agent v${{ needs.check-version.outputs.version }}"
          files: "dist/installer/Cockpit Agent Setup ${{ needs.check-version.outputs.version }}.exe"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload to backend & mark latest
        shell: pwsh
        run: |
          $v   = "${{ needs.check-version.outputs.version }}"
          $exe = "dist\installer\Cockpit Agent Setup $v.exe"
          $r   = Invoke-RestMethod `
                   -Uri "${{ secrets.COCKPIT_API_URL }}/api/admin/agent-releases/ci-upload" `
                   -Method POST `
                   -Headers @{ "X-CI-API-Key" = "${{ secrets.COCKPIT_CI_API_KEY }}" } `
                   -Form @{
                     file      = Get-Item $exe
                     version   = $v
                     platform  = "windows"
                     arch      = "x64"
                     changelog = "Release automatique v$v"
                   }
          Write-Output "Release enregistrée : $($r.id)"
```

---

## Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `cockpit-agent/installer/main.js` | Fix SHA256 prefix (`sha256:` → strip avant comparaison) |
| `cockpit-agent/.github/workflows/release.yml` | **NOUVEAU** — workflow CI/CD complet |
| `insightsage_backend/src/admin/agent-releases/ci-api-key.guard.ts` | **NOUVEAU** — guard X-CI-API-Key |
| `insightsage_backend/src/admin/agent-releases/agent-releases.controller.ts` | +1 endpoint `POST ci-upload` |
| `insightsage_backend/.env.example` | +1 variable `CI_API_KEY` |

---

## Ce que tu dois faire de ton côté

### Sur le repo GitHub (cockpit-agent)
→ **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valeur |
|---|---|
| `COCKPIT_API_URL` | URL du backend prod, ex: `https://api.cockpit.nafakatech.com` |
| `COCKPIT_CI_API_KEY` | Même valeur que `CI_API_KEY` dans le `.env.prod` backend |

> Génère une clé forte : `openssl rand -hex 32`

### Sur le backend (serveur)
→ Ajouter dans `.env.prod` :
```
CI_API_KEY=<la même valeur que le secret GitHub>
```
Puis redémarrer le backend.

### Vérifier que le storage est configuré
Le backend stocke les binaires via `StorageService` (R2 ou local).  
S'assurer que les variables R2 sont présentes dans `.env.prod` (`R2_BUCKET`, `R2_ACCESS_KEY_ID`, etc.) pour que l'URL publique du fichier soit accessible lors du téléchargement client.

---

## Vérification end-to-end

1. Incrémenter la version dans `package.json` (ex: `1.1.0` → `1.2.0`)
2. Push sur `main` → GitHub Actions démarre
3. Job `check-version` (ubuntu, ~10s) : détecte que le tag `v1.2.0` n'existe pas → `should_release=true`
4. Job `build-and-release` (windows, ~10-15min) :
   - Build réussi → `dist/installer/Cockpit Agent Setup 1.2.0.exe` créé
   - Tag `v1.2.0` poussé sur le repo
   - GitHub Release créée avec l'exe en asset
   - Upload multipart vers le backend → `AgentRelease` créée + marquée `isLatest=true`
5. Client ouvre le ManagementDashboard → bannière "Version 1.2.0 disponible"
6. Clic "Mettre à jour" → téléchargement → checksum validé → service mis à jour
7. Nouveau push sur `main` sans bump de version → job `check-version` détecte tag existant → **skip complet**, aucun build déclenché
