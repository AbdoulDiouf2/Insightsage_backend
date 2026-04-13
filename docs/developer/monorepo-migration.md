# Guide de Migration vers un Monorepo

Ce document détaille la stratégie et les étapes techniques pour fusionner les différents dépôts du projet Cockpit (`Backend`, `Admin`, `Client`, `Agent`) en un seul dépôt centralisé (Monorepo).

---

## 1. Pourquoi migrer ? (Le "Business Case")

*   **Partage de code** : Partagez les schémas Prisma et les types TypeScript entre tous les services.
*   **Historique Atomique** : Une seule Pull Request peut modifier le Backend et les Frontends simultanément.
*   **Orchestration** : Utilisez un seul pipeline CI/CD pour gérer l'ensemble du projet.
*   **Simplicité** : Un seul `git clone` et une seule version des outils (Linter, Prettier, TSConfig).

---

## 2. Choix Technologique : Turborepo

Nous recommandons d'utiliser **[Turborepo](https://turbo.build/repo)** avec **npm workspaces**. C'est le standard actuel pour les projets TypeScript.

---

## 3. Stratégie de Fusion (Sans perdre l'historique)

Il est crucial de conserver l'historique Git de chaque projet. Voici la procédure recommandée :

1.  **Créer le nouveau dépôt monorepo** :
    ```bash
    mkdir cockpit-monorepo && cd cockpit-monorepo
    git init
    ```
2.  **Importer chaque dépôt comme une "remote"** :
    ```bash
    # Exemple pour le backend
    git remote add backend_repo https://github.com/Nafaka-tech/Insightsage_backend
    git fetch backend_repo
    git merge backend_repo/main --allow-unrelated-histories
    
    # Déplacer immédiatement dans le dossier cible
    mkdir -p apps/backend
    # (Sous Windows, utilisez PowerShell ou déplacez manuellement sauf .git)
    mv * apps/backend/ (attention à ne pas déplacer .git)
    git add . && git commit -m "chore: move backend to apps/backend"
    ```
3.  **Répéter** pour `admin-cockpit`, `Client-cockpit`, etc.

---

## 4. Structure cible du Monorepo

```text
/cockpit-monorepo
  ├── apps/
  │   ├── backend/        # NestJS API
  │   ├── admin-panel/    # React Admin
  │   └── client-app/     # React Client
  ├── packages/
  │   ├── database/       # Schéma Prisma + Client partagé
  │   ├── dto/           # Interfaces TS communes
  │   ├── ui/            # Composants React partagés (boutons, formulaires)
  │   └── tsconfig/      # Configs TS de base
  ├── package.json        # Racines des workspaces
  └── turbo.json          # Configuration de Turborepo
```

---

## 5. Partage des Types et Prisma (L'étape CRITIQUE)

C'est le facteur de succès n°1 d'une migration monorepo :

1.  Déplacez le dossier `prisma/` à la racine de `packages/database/`.
2.  Générez le client Prisma dans ce package.
3.  Dans `apps/backend/package.json`, ajoutez `"@cockpit/db": "workspace:*"` comme dépendance.
4.  Désormais, le backend et les frontends utilisent **exactement** les mêmes interfaces générées depuis le schéma de base de données.

---

## 6. Migration de la CI/CD

Dans un monorepo, vous ne voulez pas tout re-déployer si vous changez juste une virgule dans la doc.

### Détection de changement (Path-based triggers)
Mettez à jour vos workflows GitHub Actions :
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
```

### Turbo Pipeline
Configurez `turbo.json` pour paralléliser les builds :
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

---

## 7. Checklist des Facteurs à surveiller

- [ ] **Variables d'env** : Créez des fichiers `.env` spécifiques à chaque dossier dans `apps/`.
- [ ] **Dépendances** : Utilisez `npm install` à la racine du monorepo uniquement.
- [ ] **Types** : Évitez les copies d'interfaces. Si un type est utilisé deux fois, il doit aller dans `packages/dto`.
- [ ] **Ports** : Assurez-vous que chaque application a son propre port de développement local (ex: Backend:3000, Admin:3001, Client:3002).
- [ ] **Hébergement Windows** : Votre configuration IIS actuelle est compatible. Il faudra juste mettre à jour les chemins physiques vers `apps/backend/dist`, etc.

---

## 8. Résumé de la commande de lancement (Global)

Une fois migré, voici comment vous travaillerez :
```bash
# Lancer tout le projet en mode dev avec hot-reload partout
npm run dev

# Builder tout le projet d'un coup
npm run build
```
