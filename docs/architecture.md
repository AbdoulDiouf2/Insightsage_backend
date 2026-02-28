# Documentation d'Architecture InsightSage

## 1. Diagramme High-Level des Composants

```mermaid
graph TD
    subgraph "Front-End MVP"
        CFO[Utilisateur CFO/DAF] -->|HTTPS / REST| API[API Back-end NestJS]
    end

    subgraph "Back-End Applicatif"
        API --> DB[(Base de données PostgreSQL)]
    end

    subgraph "Infrastructure Data (On-Prem / Cloud)"
        API <-->|Requêtes SQL SAFE (Lecture seule)| Agent[Agent On-Prem]
        Agent <-->|pyodbc / direct| ERP[Sage X3 / 100]
    end
```

## 2. Principes Fondamentaux & Sécurité (Zero-Copy)

* **Zero ERP credentials in SaaS** : L'API ne stocke aucun mot de passe Sage, ils restent dans l'Agent.
* **No Inbound Connection** : Le Cloud ne se connecte jamais au réseau du client (l'Agent initie une connexion sortante/poll le SaaS).
* **Agent handles data access** : Seul l'Agent parle à la base de données.
* **Backend handles security logic** : L'API génère le SQL, l'Agent l'exécute bêtement.
* **Strict SQL Sandbox** : Requêtes `SELECT` uniquement, limitées à 1000 lignes (`TOP 1000`).

## 3. Rôles et Responsabilités

### Rôle du Backend
* Authentification & RBAC
* Isolation multi-tenant stricte (`organization_id`)
* Gestion de tokens Agent & Rate limiting
* Génération SQL sécurisée via **Templates validés** (aucune génération SQL libre n'est autorisée par l'IA)
* Monitoring du statut Agent et de la santé des requêtes

### Modèle Agent (Hors périmètre SaaS)
* Installé comme service système métier.
* Gardien des credentials ERP locaux.
* Maintien d'un heartbeat (`last_seen`) avec le Backend.

## 4. Choix Techniques et Conventions

*   **Framework Principal** : NestJS (TypeScript).
*   **Base de Données** : PostgreSQL.
*   **ORM** : Prisma.
*   **Authentification** : JWT (JSON Web Tokens) avec stratégies Passport.
*   **Outils de Qualité** :
    *   ESLint et Prettier pour le linter/formatteur.
    *   Husky + lint-staged pour les pre-commit hooks (garantissant un formatage automatique avant chaque commit).
*   **Structure de Code** : Orientée module (Domain-Driven Design léger), où chaque domaine métier (Users, Auth, Dashboards, etc.) dispose de son propre module, contrôleur et service.
*   **Conventions de Nommage** :
    *   Fichiers : `kebab-case.ts` (ex: `auth.controller.ts`).
    *   Classes / Interfaces : `PascalCase`.
    *   Variables / Méthodes : `camelCase`.
    *   Base de données (Prisma) : Tables en `snake_case` plurielles (via `@@map()`), champs en `camelCase`.

## 3. Liste des Endpoints Prévus (OpenAPI Base Spec)

L'API sera documentée interactivement via Swagger (accessible sur `/api` en développement). Voici les groupements principaux à implémenter :

*   **Auth** :
    *   `POST /auth/login` : Authentification.
    *   `POST /auth/refresh` : Rotation de token.
*   **Users** :
    *   `GET /users/me` : Profil courant.
    *   `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` : Gestion CRUD utilisateurs.
*   **Organizations (Tenants)** :
    *   Attribut `organizationId` partagé sur l'ensemble des requêtes (isolation des données).
*   **Onboarding** :
    *   `GET /subscriptions/plans`
    *   `POST /onboarding/step[1-5]` : Wizard de setup (plan, infos org, source de données, profils métiers).
    *   `POST /datasource/test-connection`
*   **Dashboards & Widgets** :
    *   `GET /dashboards/me`, `POST /dashboards`, `PATCH /dashboards/:id`
    *   `GET /kpi-packs`, `GET /widget-store`
    *   `POST /dashboards/:id/widgets`
*   **NLQ (Natural Language Querying)** :
    *   `POST /nlq/query` : Traduction texte vers données/SQL.
    *   `POST /nlq/add-to-dashboard` : Sauvegarde sous forme de widget.
*   **Logs (Audit)** :
    *   `GET /logs/audit` : Récupération des logs par filtrage (Admin uniquement).
