# TODO global Nafaka / InsightSage – Back-end & Full Stack MVP

## 0. Préparation projet

- [x] Créer le dépôt Git privé du back-end (ex: `insightsage-backend`), avec branches principales (`main`, `develop`) et règles de PR.
- [x] Initialiser la structure de base du projet back-end (framework choisi : ex. Nest.js, FastAPI, etc.).
- [x] Configurer les environnements :  
  - [x] `.env.example` pour variables sensibles (DB, JWT secret, SMTP, etc.).  
  - [x] Configurations séparées `dev`, `test`, `prod`.
- [x] Définir la stack technique finale avec le client / équipe (en s’alignant sur les recommandations du cahier des charges global).
- [x] Mettre en place un système de migration de base de données (ex: Prisma, TypeORM, Alembic).
- [x] Configurer les outils de qualité de code :  
  - [x] Linter (ESLint / flake8, etc.).  
  - [x] Formatter (Prettier / Black).  
  - [x] Pre-commit hooks (optionnel mais recommandé).
- [x] Rédiger un `README` de base avec : installation, lancement dev, structure de dossiers.

***

## Principes fondamentaux

* Zero ERP credentials in SaaS
* Cloud does not connect inbound to client network
* Agent handles data access
* Backend handles security logic
* Multi-tenant strict isolation
* Enterprise-ready security by design

## MVP STRICT (30 jours)

1. Auth + RBAC + isolation org
2. Agent registration + status monitoring
3. Onboarding minimal avec step agent
4. 5 KPIs DAF essentiels
5. NLQ template-based (10 intents max)
6. Cockpit simple (1 dashboard principal)

*(Repoussé en Phase 2 : Widget Store avancé, Packs multiples complexes, Monitoring Prometheus, RGPD avancé, Connecteurs non ERP)*

***

## 1. Architecture & conception (Phase 1)

### 1.1. Architecture globale

#### Rôle du Backend

Le backend est responsable uniquement de :
* Authentification & RBAC
* Isolation multi-tenant (`organization_id`)
* Gestion des tokens Agent
* Génération SQL sécurisée via templates validés
* Validation `SELECT only` / interdiction `DROP/UPDATE/INSERT`
* Ajout automatique restriction lignes (ex: `TOP 1000`)
* Rate limiting logique
* Monitoring du statut Agent
* Audit logs

Le backend ne :
* Se connecte jamais directement à Sage
* Ne stocke jamais de credentials ERP
* N’ouvre aucun port entrant vers le client

#### Hors périmètre Backend (Agent / Data Engineer)

* Connexion directe (ex: pyodbc) à Sage
* Stockage credentials Sage (exclusif à l'Agent)
* Validation SQL côté base locale
* Mapping tables physiques profond
* Maintenance service système agent

- [x] Définir les modules back-end principaux :  
  - [x] `auth` (authentification, sessions, tokens).  
  - [x] `users` (utilisateurs, rôles, permissions).  
  - [x] `organizations` (entreprises / tenants).  
  - [x] `subscriptions` (plans : Startup, PME, Business, Enterprise).
  - [x] `onboarding` (wizard de configuration initiale).
  - [x] `dashboards` (cockpit, layout, widgets).
  - [x] `widgets` (library, Widget Store, packs de KPIs).
  - [x] `nlq` (NLQ requests, mapping intents → templates SQL).
  - [x] `logs` (audit logs, events, monitoring).
  - [x] `admin` (monitoring agent, sync, paramètres techniques).

- [x] Choisir le modèle multi-tenant (une DB par client, un schéma par client, ou champ `organization_id`).
- [x] Concevoir le schéma de base de données pour :  
  - [x] Utilisateurs, rôles, permissions, invitations.  
  - [x] Organisations, abonnements, paramètres.  
  - [x] Profils métiers (CFO/DAF, DG, Manager, etc.).
  - [x] Cockpits, dashboards, widgets.  
  - [x] Sessions NLQ, requêtes, cache éventuel.  
  - [x] Logs d’audit (actions, accès, erreurs).

### 1.2. Documentation architecture

- [x] Produire un diagramme high-level des composants :  
  - [x] Agent on-prem (géré par Data Engineer) → Staging/DWH → API métier.
  - [x] Front → API back-end → DB application.  
- [x] Documenter les choix techniques : frameworks, libs, structure du code, conventions de nommage.
- [x] Lister les endpoints prévus (spec de base type OpenAPI) :  
  - [x] `auth/*`, `users/*`, `organizations/*`, `onboarding/*`, `dashboards/*`, `widgets/*`, `nlq/*`, `logs/*`.

***

## 2. Authentification & RBAC (Phase 2)

### 2.1. Authentification (OAuth2 / JWT)

- [x] Implémenter l’inscription / création de compte admin (ou invite-only selon décision produit).
- [x] Implémenter la connexion utilisateur avec :  
  - [x] Email + mot de passe (hash sécurisé).  
  - [x] Génération de token JWT (access + refresh si besoin).
- [x] Mettre en place la rotation / expiration des tokens.
- [x] Ajouter endpoints :  
  - [x] `POST /auth/register` (si applicable).  
  - [x] `POST /auth/login`.  
  - [x] `POST /auth/refresh`.  
  - [x] `POST /auth/logout`.  
- [x] Gérer la récupération de mot de passe (optional mais utile) :  
  - [x] `POST /auth/forgot-password`.  
  - [x] `POST /auth/reset-password`.  

### 2.2. Gestion des rôles & permissions (RBAC)

- [x] Modéliser les rôles : DAF/CFO, DG, Manager, Analyst, Admin, etc.
- [x] Créer les tables / entités :  
  - [x] `roles` (nom, description).  
  - [x] `permissions` (action, ressource).  
  - [x] `role_permissions`.  
  - [x] `user_roles`.
- [x] Implémenter un middleware/guard de contrôle d’accès :  
  - [x] Vérifier le token JWT.  
  - [x] Charger l’utilisateur et ses rôles.  
  - [x] Vérifier les permissions nécessaires pour chaque route sensible.
- [x] Exposer endpoints pour gestion des utilisateurs & rôles :  
  - [x] `GET /users/me`.  
  - [x] `GET /users`.  
  - [x] `POST /users` (invitation gérée par `/auth/invite`).
  - [x] `PATCH /users/:id` (mise à jour rôle, profil métier).  
  - [x] `DELETE /users/:id`.  

### 2.3. Sécurité & isolation

- [x] Vérifier l’isolation par organisation (toutes les requêtes doivent être filtrées par `organization_id`).
- [x] Ajouter des règles pour masquer les données sensibles : PII masking implémenté.
  - [x] `users.service.ts` : `findByIdSafe` et `findAllByOrganization` excluent `passwordHash`, `hashedRefreshToken`, `resetPasswordToken`, `resetPasswordExpires` via Prisma `select`.
  - [x] `audit-log.service.ts` : `sanitizePayload()` masque automatiquement emails (`j***@domaine.com`) et mots de passe (`[REDACTED]`) avant persistance.
  - [x] `auth.service.ts` : suppression du `debug: { resetToken }` dans la réponse HTTP `forgotPassword` ; audit log toujours déclenché.

### 2.4 Agent Token Management
- [x] `POST /agents/generate-token` → génère `agent_token` par org (validité 30 jours, `tokenExpiresAt` retourné)
- [x] Token rotation (30j), revocable :
  - [x] Champs `tokenExpiresAt`, `isRevoked`, `revokedAt` ajoutés au modèle `Agent` (Prisma + DB push).
  - [x] `registerAgent` et `processHeartbeat` valident que le token n’est ni révoqué ni expiré.
  - [x] `regenerateToken` réinitialise `tokenExpiresAt` à +30j et efface la révocation.
  - [x] `POST /agents/:id/revoke` : endpoint de révocation explicite ajouté.
  - [x] Alerte `isExpiringSoon` dans le heartbeat si < 7 jours avant expiration.

***

## 3. Onboarding & configuration compte

### 3.1. Modèle de données onboarding

- [x] Créer les entités pour :
  - [x] Abonnements (Startup/PME, Business, Enterprise) : modèle `SubscriptionPlan` en BDD avec CRUD superadmin (`/admin/subscription-plans`). Seed des 4 plans dans `prisma/seed.ts`. Plans gérables sans redéploiement (prix, limites, Stripe Phase 2).
  - [x] Organisation : champs `country`, `sageMode`, `selectedProfiles`, `planId` (FK vers `SubscriptionPlan`) ajoutés au modèle `Organization`.
  - [x] Profils métiers liés à l’organisation (CFO, DG, etc.) : liste statique dans `OnboardingService.getAvailableProfiles()` + `selectedProfiles String[]` sur `Organization`.
  - [x] Statut d’onboarding (étape, complété ou non) : modèle `OnboardingStatus` (`currentStep`, `completedSteps[]`, `isComplete`, `inviteLater`) — relation 1-1 avec `Organization`.

### 3.2. Endpoints onboarding (wizard)

- [x] Étape 1 – Choix du plan d’abonnement :
  - [x] `GET /subscriptions/plans` (liste des plans actifs depuis DB — `@Public()`).
  - [x] `POST /onboarding/step1` (`{ plan }` → lie `org.planId` + avance wizard).
- [x] Étape 2 – Création organisation :
  - [x] `POST /onboarding/step2` (`{ name?, sector?, size?, country? }` — update partiel).
- [x] Étape 3 – Configuration data source Sage :
  - [x] `POST /onboarding/step3` (`{ sageType, sageMode, sageHost?, sagePort? }`).
  - [x] `POST /onboarding/agent-link` (`{ agentToken }` — validation token + vérif appartenance org).
  - [x] `POST /datasource/test-connection` (vérifie statut agent online — MVP).
- [x] Étape 4 – Profils métiers & KPIs :
  - [x] `GET /onboarding/profiles` (liste statique : DAF, DG, Controller, Manager, Analyste).
  - [x] `POST /onboarding/step4` (`{ profiles: string[] }` → `org.selectedProfiles`).
- [x] Étape 5 – Invitations utilisateurs :
  - [x] `POST /onboarding/step5` (`{ invitations: [{ email, role }] }` via `auth.inviteUser()`).
  - [x] Option “inviter plus tard” (`inviteLater: true` → `OnboardingStatus.inviteLater = true`).

### 3.3. Logique de sauvegarde et reprise

- [x] Stocker la progression par organisation : `OnboardingStatus.completedSteps[]` + `currentStep`.
- [x] Reprendre l’onboarding : `GET /onboarding/status` auto-crée le statut si inexistant + retourne état complet.
- [x] Erreurs explicites : token révoqué/expiré, agent autre org, profils inconnus, plan inactif.
- [x] `GET /organizations/me` + `PATCH /organizations/me` pour lecture/mise à jour org par le DAF.

***

## 4. Cockpit, dashboards, widgets & Widget Store (Phase 3)

### 4.1. Modélisation des widgets & dashboards

- [ ] Définir les entités :  
  - [ ] `kpi_definitions` (nom, description, métrique, dimension, etc.).
  - [ ] `widget_templates` (type de vue : KPI card, graph, table, etc.).
  - [ ] `widgets` (instance de widget sur un dashboard, paramètres, filtres).
  - [ ] `dashboards` (cockpit, nom, owner, layout).
  - [ ] `kpi_packs` (packs par profil métier : pack DAF, etc.).

### 4.2. Endpoints pour cockpit CFO/DAF

- [ ] `GET /dashboards/me` (récupérer le cockpit de l’utilisateur courant).
- [ ] `GET /dashboards/:id` (détail).  
- [ ] `POST /dashboards` (création d’un nouveau dashboard).  
- [ ] `PATCH /dashboards/:id` (renommer, changer layout).  
- [ ] `DELETE /dashboards/:id`.  
- [ ] `GET /kpi-packs?profile=DAF` (pack de KPIs préconfigurés pour DAF).

### 4.3. Widget Store

- [ ] `GET /widget-store` (liste de tous les widgets disponibles par profil/organisation).
- [ ] `POST /dashboards/:id/widgets` (ajouter un widget au dashboard).
- [ ] `PATCH /dashboards/:id/widgets/:widgetId` (modifier position, taille, filtres).
- [ ] `DELETE /dashboards/:id/widgets/:widgetId`.

### 4.4. Layout et personnalisation

- [ ] Gérer le layout (position, taille) via un modèle (grid, colonnes, etc.).
- [ ] Permettre activation/désactivation de KPIs dans le cockpit (enregistrer l’état par utilisateur + profil).

***

## 5. Interface NLQ & intégration avec API (Phase 3/4)

### 5.1. Modèle de données NLQ

- [ ] Créer entités :  
  - [ ] `nlq_intents` (intent type, ex: “CA des 3 derniers mois”).
  - [ ] `nlq_templates` (templates SQL paramétrés associés à des exposures du semantic layer).
  - [ ] `nlq_sessions` ou `nlq_queries` (user_id, intent, texte envoyé, SQL généré, résultat résumé, latence).

### 5.2. Endpoints NLQ

- [ ] `POST /nlq/query` : Entrée texte → SQL safe → Agent Sage → résultat seul
  - [ ] Le SQL est exclusivement généré à partir de **templates validés** (aucune génération libre n’est autorisée).
  - [ ] Vérification stricte via regex (`^SELECT`).
  - [ ] Interdiction stricte : `UPDATE`, `DELETE`, `INSERT`, `DROP`.
  - [ ] Limitation automatique des lignes ajoutée au code SQL (ex: `TOP 1000`).
  - [ ] Whitelist stricte des tables autorisées dans le template.
- [ ] `POST /nlq/add-to-dashboard` :  
  - [ ] Crée un widget basé sur le résultat NLQ dans un dashboard donné.

### 5.3. Logique NLQ (MVP)

- [ ] Intégrer avec le moteur NLQ côté Data Engineer (template-based, exposures).
- [ ] Implémenter mapping léger NLP (dates, entités, synonymes) si côté back.
- [ ] Ajouter une étape de validation de sécurité :  
  - [ ] Vérifier que le SQL généré respecte les exposures autorisées.
- [ ] Enregistrer les logs NLQ : intent, SQL, latence, succès/erreur.

***

## 6. Intégration data & agent (en collaboration avec Data Engineer)

- [ ] Définir les contrats d’API entre back-end applicatif et couche data (staging/DWH, semantic layer).
- [ ] Endpoints internes ou services pour :  
  - [ ] Récupérer les listes d’exposures / métriques disponibles.  
  - [ ] Exécuter des requêtes paramétrées (via Data Engineer).
- [ ] Gérer les erreurs de sync / agent :  
  - [ ] Expositions de statuts de sync (pour l’admin).
  - [ ] Logs consultables (voir section monitoring).

### 6.1 Sage Agent Integration (Query Direct - NO COPY DATA)

#### Modèle Agent (Documentation)
* L’Agent est installé comme service système (Windows Service / daemon Linux).
* Il démarre automatiquement au boot.
* Il initie une connexion sortante HTTPS vers le SaaS.
* Il maintient un heartbeat (`last_seen`).
* Il exécute les requêtes SQL en lecture seule.
* Il retourne uniquement du JSON.
*(Le SaaS ne lance jamais l’Agent à distance.)*

#### 6.1.1 Modèle de données Agent
- [ ] Table `datasource_agents` : `organization_id`, `agent_token` (UUID), `sage_type` (X3/100), `version`, `status` (online/offline), `last_seen`, `error_count`
  **→ Aucun champ sensible ERP stocké en base.**
- [ ] Table `sage_config` : `tables_whitelist` (mapping Sage tables → métriques). (Suppression de toute notion de `credentials_encrypted`).

#### 6.1.2 Endpoints Agent (PRIORITÉ Phase 2/3)
**POST /agents/register**
- Input: `{ agent_token, sage_type, sage_version }`
- Output: `{ organization_id, config }`
- Action: Associe agent à org, génère whitelist tables

**POST /nlq/query → SAGE DIRECT**
- Flow: Backend → génère SQL safe → POST vers agent → exécute Sage → résultat seul
- Input: `{ organization_id, sql_query, params }`
- Output: `{ result: [numbers], metadata: {rows: N, exec_time: 200ms} }`

**POST /datasource/test-agent**
- Input: `{ agent_token }`
- Output: `{ status: "OK", sage_connected: true, sample_table_rows: 100 }`

**GET /admin/agent-status/:organization_id**
- Output: `{ last_seen, sync_lag, error_count, sage_health }`

#### 6.1.3 Sécurité Agent (CRITIQUE)
- [ ] **Whitelist tables** : seules `factures`, `clients`, `comptes` autorisées
- [ ] **SQL Sandbox** : `SELECT only`, pas `DROP/UPDATE/INSERT`
- [ ] **Resultat anonymisé** : max 1000 rows, aggregate si > seuil
- [ ] **Rate limit** : 10 req/min par agent

#### 6.1.4 Intégration Onboarding (Étape 3)
**POST /onboarding/step3-agent**
- Input: `{ sage_type, agent_token }`
- Action: 
  1. Valide token agent
  2. Test connexion Sage via agent
  3. Auto-mapping tables → KPI pack DAF
  4. Sauvegarde datasource_config

***

## 7. Audit log, monitoring & observabilité (Phase 4)

### 7.1. Audit log fonctionnel

- [ ] Définir les types d’events à logger :  
  - [ ] Connexions / déconnexions.  
  - [ ] Création/modification/suppression de dashboards ou widgets.  
  - [ ] Changement de rôles utilisateurs.  
  - [ ] Actions NLQ (requêtes, ajout au dashboard).
- [ ] Créer la table `audit_logs` :  
  - [ ] user_id, organization_id, type d’action, payload, timestamp, IP, user-agent.
- [ ] Implémenter un service central de logging qui reçoit tous les événements importants.
- [ ] Endpoints pour lecture des logs (réservés aux admins) :  
  - [ ] `GET /logs/audit?filters=...`.

### 7.2. Monitoring technique

- [ ] Exposer endpoint de health check :  
  - [ ] `GET /health` (DB, dépendances, etc.).
- [ ] Intégrer des métriques pour observabilité (si tu peux : Prometheus, etc.).
- [ ] Logger les erreurs applicatives avec stacktrace (et masquage de données sensibles).

***

## 8. Sécurité & conformité (MVP)

- [ ] Appliquer les bonnes pratiques sécurité API :  
  - [ ] HTTPS (assumé en prod),  
  - [ ] rate limiting sur endpoints sensibles,  
  - [ ] validation stricte des inputs (schema validation).
- [ ] Préparer la conformité RGPD (au moins en base) :  
  - [ ] Endpoints pour export des données utilisateur.  
  - [ ] Endpoint pour suppression/anonymisation.
- [ ] Gérer la séparation des données par organisation avec tests unitaires pour vérifier l’absence de fuites.

***

## 9. Documentation & livrables (Phase 5)

### 9.1. Documentation technique

- [ ] Documenter l’architecture globale (diagrammes + texte).
- [ ] Générer / écrire la spec OpenAPI (Swagger) des endpoints.
- [ ] Rédiger un guide développeur :  
  - [ ] Structure du projet.  
  - [ ] Comment lancer en dev / test / prod.  
  - [ ] Process de déploiement (CI/CD si mis en place).
- [ ] Documenter les modèles de données principaux (users, orgs, dashboards, widgets, NLQ, logs).

### 9.2. Roadmap technique

- [ ] Écrire une mini-roadmap pour :  
  - [ ] Multi-profils avancés.  
  - [ ] Connecteurs marketing (ex: CRM, campagnes).  
  - [ ] Agents IA pour NLQ plus avancé (LLMs, suggestions).  
  - [ ] Multi-SGBD (autres ERPs).

### 9.3. Packaging livraison

- [ ] Préparer la livraison finale :  
  - [ ] Repo Git propre (tags, release notes).  
  - [ ] Documentation PDF/MD regroupée (architecture, API, déploiement).
- [ ] S’assurer que les critères d’acceptation MVP sont couverts :  
  - [ ] CFO/DAF peut se connecter, voir son cockpit, ajouter/supprimer KPIs.  
  - [ ] NLQ répond correctement et peut ajouter un graphique au dashboard.  
  - [ ] Système stable, traçable, sécurisé.

***

## 10. Coordination avec équipe (Product / Data / Front)

- [ ] Planifier des points réguliers avec le Product Owner pour valider :  
  - [ ] Onboarding, UX des cockpits, logique métier.
- [ ] Synchroniser avec le Data Engineer sur :  
  - [ ] Interface entre API et semantic layer / DWH.  
  - [ ] Tests de performance sur requêtes clés NLQ et dashboards.
- [ ] Partager les specs d’API avec le développeur front (contrat clair, exemples de payloads).