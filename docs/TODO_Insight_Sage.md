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
- [x] `POST /datasource/discover` (Agent scan : récupère liste des dossiers/sociétés Sage dispo pour validation mapping).
  - [x] `POST /datasource/test-connection` (vérifie statut agent online — MVP).
- [x] Integrate and verify (Backend & Agent main files updated)
- [x] Update agent/requirements.txt
- [x] Update `OnboardingService` with real-time Ping
- [x] Update Admin UI (Page & Detail) with Real-Time status
- [ ] Final verification in Swagger [ ]
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

- [x] Définir les entités :
  - [x] `kpi_definitions` — modèle Prisma seedé avec 5 KPIs DAF (revenue_mom, dmp, ar_aging, gross_margin, ebitda).
  - [x] `widget_templates` — modèle Prisma seedé avec 5 types (card, bar, line, gauge, table).
  - [x] `widgets` — modèle existant (type, config Json, exposure, vizType, position Json, isActive).
  - [x] `dashboards` — modèle existant (name, layout Json, isDefault, userId, organizationId).
  - [x] `kpi_packs` — modèle Prisma seedé avec 3 packs (pack_daf, pack_dg, pack_controller).

### 4.2. Endpoints pour cockpit CFO/DAF

- [x] `GET /dashboards/me` — cockpit par défaut (isDefault=true) ou premier dashboard.
- [x] `GET /dashboards` — tous les dashboards de l’organisation.
- [x] `GET /dashboards/:id` — détail dashboard + widgets.
- [x] `POST /dashboards` — créer un dashboard (reset isDefault si applicable).
- [x] `PATCH /dashboards/:id` — renommer, changer layout, définir par défaut.
- [x] `DELETE /dashboards/:id` — supprimer (ownership vérifié).
- [x] `GET /kpi-packs?profile=DAF` — packs KPI enrichis avec détails KPI definitions.

### 4.3. Widget Store

- [x] `GET /widget-store` — catalogue (KPI packs filtrés par plan, KPI defs, widget templates).
- [x] `POST /dashboards/:id/widgets` — ajouter widget (vérifie maxWidgets du plan).
- [x] `PATCH /dashboards/:id/widgets/:widgetId` — modifier config, position, vizType, isActive.
- [x] `DELETE /dashboards/:id/widgets/:widgetId` — supprimer widget.

### 4.4. Layout et personnalisation

- [x] Layout géré via champ `position: Json` (`{x,y,w,h}`) sur chaque Widget + `layout: Json` sur Dashboard.
- [x] Activation/désactivation KPIs : champ `isActive` sur Widget, modifiable via `PATCH /dashboards/:id/widgets/:widgetId`.

### 4.5. Admin Cockpit — Gestion KPI Store

#### Backend : 12 endpoints admin (`/admin/kpi-*`)

- [x] DTOs créés dans `src/admin/dto/kpi-store.dto.ts` : `CreateKpiDefinitionDto`, `UpdateKpiDefinitionDto`, `CreateWidgetTemplateDto`, `UpdateWidgetTemplateDto`, `CreateKpiPackDto`, `UpdateKpiPackDto`.
- [x] Endpoints `KpiDefinition` (superadmin, `manage:all`) :
  - [x] `GET /admin/kpi-definitions` — lister toutes (actives + inactives).
  - [x] `POST /admin/kpi-definitions` — créer (clé unique validée).
  - [x] `PATCH /admin/kpi-definitions/:id` — modifier partiellement.
  - [x] `DELETE /admin/kpi-definitions/:id` — toggle `isActive` (soft delete/reactivate).
- [x] Endpoints `WidgetTemplate` (même pattern, champ `defaultConfig: Json` casté `as Prisma.InputJsonValue`) :
  - [x] `GET /admin/widget-templates`
  - [x] `POST /admin/widget-templates`
  - [x] `PATCH /admin/widget-templates/:id`
  - [x] `DELETE /admin/widget-templates/:id`
- [x] Endpoints `KpiPack` :
  - [x] `GET /admin/kpi-packs`
  - [x] `POST /admin/kpi-packs`
  - [x] `PATCH /admin/kpi-packs/:id`
  - [x] `DELETE /admin/kpi-packs/:id`

#### Frontend Admin Cockpit : page `/kpi-store`

- [x] Interfaces TypeScript ajoutées dans `src/types/index.ts` : `KpiDefinition`, `WidgetTemplate`, `KpiPack`.
- [x] Fonctions API ajoutées dans `src/api/index.ts` : `kpiDefinitionsApi`, `widgetTemplatesApi`, `kpiPacksApi` (getAll, create, update, toggle).
- [x] Hooks React Query ajoutés dans `src/hooks/use-api.ts` : `useKpiDefinitions`, `useWidgetTemplates`, `useKpiPacks`.
- [x] Page tabbée `/kpi-store` créée dans `src/features/kpi-store/` (10 fichiers) :
  - [x] `KpiStorePage.tsx` — page principale avec 3 onglets.
  - [x] `KpiDefinitionsTab.tsx` + `CreateKpiDefinitionModal.tsx` + `EditKpiDefinitionModal.tsx`.
  - [x] `WidgetTemplatesTab.tsx` + `CreateWidgetTemplateModal.tsx` + `EditWidgetTemplateModal.tsx`.
  - [x] `KpiPacksTab.tsx` + `CreateKpiPackModal.tsx` + `EditKpiPackModal.tsx` (checkboxes multi-select pour `kpiKeys`).
- [x] Route `/kpi-store` ajoutée dans `src/App.tsx`.
- [x] Nav item "KPI Store" ajouté dans `src/components/layout/Sidebar.tsx` (icon `BarChart3`).
- [x] Clés i18n ajoutées dans `src/i18n/fr.ts` et `src/i18n/en.ts` (`nav.kpiStore`, section `kpiStore.*`).

#### Documentation MkDocs

- [x] `docs/backend/modules/kpi-store.md` — documentation complète du module (modèles, endpoints, soft delete, intégration cockpit).
- [x] `docs/backend/api-reference.md` — section "KPI Store (Admin)" ajoutée avec les 12 endpoints.
- [x] `mkdocs.yml` — nav item `KPI Store: backend/modules/kpi-store.md` ajouté sous Modules.

***

## 5. Interface NLQ & intégration avec API (Phase 3/4)

### 5.1. Modèle de données NLQ

- [x] Créer entités :  
  - [x] `nlq_intents` (intent type, ex: “CA des 3 derniers mois”).
  - [x] `nlq_templates` (templates SQL paramétrés associés à des exposures du semantic layer).
  - [x] `nlq_sessions` ou `nlq_queries` (user_id, intent, texte envoyé, SQL généré, résultat résumé, latence).

### 5.2. Endpoints NLQ

- [x] `POST /nlq/query` : Entrée texte → SQL safe → Agent Sage → résultat seul
  - [x] Le SQL est exclusivement généré à partir de **templates validés** (aucune génération libre n’est autorisée).
  - [x] Vérification stricte via regex (`^SELECT`).
  - [x] Interdiction stricte : `UPDATE`, `DELETE`, `INSERT`, `DROP`.
  - [x] Limitation automatique des lignes ajoutée au code SQL (ex: `TOP 1000`).
  - [x] Whitelist stricte des tables autorisées dans le template.
- [x] `POST /nlq/add-to-dashboard` :  
  - [x] Crée un widget basé sur le résultat NLQ dans un dashboard donné.

### 5.3. Logique NLQ (MVP)

- [x] Intégrer avec le moteur NLQ côté Data Engineer (template-based, exposures).
- [x] Implémenter mapping léger NLP (dates, entités, synonymes) si côté back.
- [x] **Mapping Dynamique KPI ↔ SQL** : Système de sélection du template SQL basé sur la version de Sage (`Sage 100` vs `Sage X3`).
- [x] Ajouter une étape de validation de sécurité :  
  - [x] Vérifier que le SQL généré respecte les exposures autorisées.
- [x] Enregistrer les logs NLQ : intent, SQL, latence, succès/erreur.
- [ ] **NLP Context** : Gérer les suivis (ex: "et pour le mois dernier ?")
- [x] Gérer le retour de l'agent et le stocker en DB (lié via `jobId`).

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
- [x] Table `datasource_agents` : `organization_id`, `agent_token` (UUID), `sage_type` (X3/100), `version`, `status` (online/offline), `last_seen`, `error_count`
  **→ Aucun champ sensible ERP stocké en base.**
- [x] Table `sage_config` : `tables_whitelist` (mapping Sage tables → métriques). (Suppression de toute notion de `credentials_encrypted`).

#### 6.1.2 Endpoints Agent (PRIORITÉ Phase 2/3)
**POST /agents/register**
- [x] Input: `{ agent_token, sage_type, sage_version }`
- [x] Output: `{ organization_id, config }`
- [x] Action: Associe agent à org, génère whitelist tables

**POST /nlq/query → SAGE DIRECT (Temps Réel via WebSockets)**
- [x] Setup NestJS WebSocket Gateway (Socket.io)
- [x] Implement Agent Authentication for WebSockets
- [x] Implement `execute_sql` event in Backend Gateway
- [x] Implement `sql_result` event in Backend Gateway
- [x] Modify Python Agent to connect via `socketio`

**POST /datasource/test-agent**
- [x] Input: `{ agent_token }`
- [x] Output: `{ status: "OK", sage_connected: true, sample_table_rows: 100 }`

**GET /admin/agent-status/:organization_id**
- [x] Output: `{ last_seen, sync_lag, error_count, sage_health }`

#### 6.1.3 Sécurité Agent (CRITIQUE)
- [x] **Whitelist tables** : seules `factures`, `clients`, `comptes` autorisées (implémenté côté Agent)
- [x] **SQL Sandbox** : `SELECT only`, pas `DROP/UPDATE/INSERT` (Double validation Backend + Agent)
- [x] **Scoping par Société/Dossier** : Injection dynamique du nom de la base de données (depuis `sageConfig`) dans le SQL via placeholder.
- [ ] **Resultat anonymisé** : max 1000 rows, aggregate si > seuil
- [ ] **Rate limit** : 10 req/min par agent

#### 6.1.4 Intégration Onboarding (Étape 3)
**POST /onboarding/step3-agent**
- [x] Input: `{ sage_type, agent_token }`
- [x] Action: 
  1. Valide token agent
  2. Test connexion Sage via agent
  3. Auto-mapping tables → KPI pack DAF
  4. Sauvegarde datasource_config

### 6.2 Améliorations (Hardening & Observabilité Agent)

- [x] **1. Timeout système** : Auto-marquage des jobs en `FAILED` si pas de réponse après X secondes (NestJS logic).
- [x] **2. Retry policy** : Mécanisme de récupération des jobs interrompus lors d'une déconnexion/reconnexion.
- [x] **3. Rate limiting par agent** : Protection de l'ERP Sage contre les surcharges de requêtes (10 req/min).
- [x] **4. Isolation par tenant renforcée** : Scoping immuable du token à l'org lors du handshake WebSocket.
- [x] **5. Logging centralisé** : Stream des logs agents vers le backend pour une visibilité totale dans le cockpit admin.
- [x] **6. Normalisation des résultats (Result Transformer)** : Couche backend pour transformer le JSON brut de l'agent en format standardisé pour le Front.
- [x] **7. Stratégie de Caching Intelligent** : Cache des résultats de KPIs fréquents pour économiser les ressources de l'ERP du client.

***

## 7. Audit log, monitoring & observabilité (Phase 4)

### 7.1. Audit log fonctionnel

- [x] Définir les types d’events à logger :  
  - [x] Connexions / déconnexions.  
  - [x] Création/modification/suppression de dashboards ou widgets.  
  - [x] Changement de rôles utilisateurs.  
  - [x] Actions NLQ (requêtes, ajout au dashboard).
- [x] Créer la table `audit_logs` :  
  - [x] user_id, organization_id, type d’action, payload, timestamp, IP, user-agent.
- [x] Implémenter un service central de logging qui reçoit tous les événements importants.
- [x] Ajouter un intercepteur HTTP global (`AuditInterceptor`) couvrant **tous** les endpoints :
  - [x] 46 routes mappées sur Auth, Users, Roles, Dashboards, Widgets, Agents, Onboarding, Admin.
  - [x] Logging automatique : `userId`, `organizationId`, `ipAddress`, `userAgent`, `method`, `path`, `duration_ms`, `status`, `entityId`.
  - [x] Erreurs HTTP aussi loggées (`statusCode`, `errorMessage`, `status: 'error'`).
  - [x] 17 nouveaux `AuditEventType` ajoutés (token_refreshed, profile_updated, kpi_definition_*, widget_template_*, kpi_pack_*, subscription_plan_*, audit_logs_viewed, admin_users_listed, admin_organizations_listed, agent_connection_tested, agent_query_executed).
- [x] Endpoints pour lecture des logs (réservés aux admins) :
  - [x] `GET /logs/audit?filters=...`.

### 7.2. Monitoring technique

- [x] Exposer endpoint de health check :  
  - [x] `GET /health` (DB, dépendances, etc.).
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

- [x] Documenter l’architecture globale (diagrammes + texte) :
  - [x] `docs/architecture/overview.md`, `docs/architecture/data-flow.md`, `docs/architecture/tech-stack.md`, `docs/architecture.md`, `docs/Choix_techniques.md`.
- [x] Générer / écrire la spec OpenAPI (Swagger) des endpoints :
  - [x] `SwaggerModule` configuré dans `main.ts` (`GET /api`).
  - [x] Tous les controllers annotés (`@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`, `@ApiResponse`, `@ApiParam`, `@ApiQuery`).
  - [x] `docs/backend/api-reference.md` — référence API complète.
- [x] Rédiger un guide développeur :
  - [x] Structure du projet : `docs/getting-started.md`, `docs/backend/setup.md`.
  - [x] Comment lancer en dev / test / prod : `docs/backend/setup.md`, `docs/developer/deployment.md`.
  - [x] Process de déploiement (CI/CD) : `docs/developer/ci-cd.md`, `docs/developer/standards.md`.
- [x] Documenter les modèles de données principaux :
  - [x] `docs/backend/database.md` + `docs/backend/modules/` (auth, users, agents, onboarding, roles, organizations, subscriptions, audit-logs, kpi-store).

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
***

## 11. Roadmap de Déploiement Professionnel (Windows Server)

### Phase 1 — Préparation au développement (Maintenant)
- [ ] **Structurer les projets proprement** :
  - [ ] Organiser en `backend/`, `frontend-client/`, `frontend-admin/`.
  - [ ] Assurer la présence de `.env.development` et `.env.production`.
- [ ] **Configurer les variables d'environnement de production** :
  - [ ] Frontends : `VITE_API_URL=https://api.mondomaine.com` (même si fictif pour l'instant).
  - [ ] Backend : `PORT`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
- [ ] **Tester en local en mode "production"** :
  - [ ] Backend : `npm run build` + `node dist/main.js`.
  - [ ] Frontends : `npm run build` + `npm run preview`.

### Phase 2 — Préparation Serveur (Accès Client)
- [ ] **Installation sur Windows Server** :
  - [ ] Node.js (LTS).
  - [ ] IIS (Internet Information Services).
  - [ ] Module URL Rewrite.
  - [ ] Application Request Routing (ARR).
- [ ] **Gestionnaire de processus** :
  - [ ] Installer `pm2` pour la persistance du backend.
- [ ] **Configuration Firewall** :
  - [ ] Autoriser les ports 80 (HTTP) et 443 (HTTPS).

### Phase 3 — Configuration DNS (Avant mise en ligne)
- [ ] Pointer les sous-domaines vers l'IP du serveur :
  - [ ] `api.mondomaine.com`
  - [ ] `app.mondomaine.com`
  - [ ] `admin.mondomaine.com`

### Phase 4 — Déploiement Réel (Mise en production)
- [ ] **Déployer le Backend** :
  - [ ] `npm install` + `npm run build`.
  - [ ] `pm2 start dist/main.js`.
  - [ ] Vérifier l'accès local (`http://localhost:3000`).
- [ ] **Déployer les Frontends** :
  - [ ] Copier le dossier `dist` (client) vers `C:\inetpub\wwwroot\app`.
  - [ ] Copier le dossier `dist` (admin) vers `C:\inetpub\wwwroot\admin`.

### Phase 5 — Configuration IIS (Reverse Proxy)
- [ ] **Configuration des Bindings** :
  - [ ] Binding 1 : `app.mondomaine.com` → dossier `/app`.
  - [ ] Binding 2 : `admin.mondomaine.com` → dossier `/admin`.
  - [ ] Binding 3 : `api.mondomaine.com` → Reverse proxy vers `http://localhost:3000`.

### Phase 6 — Sécurisation & HTTPS
- [ ] **Installer les certificats SSL** (Let's Encrypt ou certificat entreprise).
- [ ] **Activer SSL** pour les 3 sous-domaines.
- [ ] **Désactiver l'accès direct** au port 3000 depuis l'extérieur.

### Phase 7 — Tests Finaux & Clôture
- [ ] **Validation fonctionnelle** : Login, appels API, Admin, gestion d'erreurs, rafraîchissement de page.
- [ ] **Post-Déploiement** :
  - [ ] Configurer les sauvegardes automatiques de la base de données.
  - [ ] Configurer la rotation des logs.
  - [ ] Vérifier le redémarrage automatique des services.