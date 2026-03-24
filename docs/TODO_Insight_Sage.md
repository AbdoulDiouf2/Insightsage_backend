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

### 2.5. Emails transactionnels (Mailer)

- [x] Installer `nodemailer` + `@types/nodemailer` (`--legacy-peer-deps`)
- [x] Créer `src/mailer/mailer.module.ts` — module global NestJS
- [x] Créer `src/mailer/mailer.service.ts` — transport nodemailer + fallback `console.log` si `SMTP_HOST` absent
- [x] Créer les 3 templates HTML dans `src/mailer/templates/` :
  - [x] `reset-password.html` — lien valable 1h
  - [x] `invitation.html` — lien valable 7j, inclut nom org + rôle
  - [x] `welcome-setup.html` — lien de configuration compte pour nouveau DAF créé par superadmin
- [x] Intégrer `MailerService` dans `AuthService` :
  - [x] `forgotPassword()` → `sendResetPasswordEmail()`
  - [x] `inviteUser()` → `sendInvitationEmail()`
- [x] Intégrer `MailerService` dans `AdminService` :
  - [x] `createClientAccount()` → `sendWelcomeSetupEmail()` + suppression du `debug.setupToken` dans la réponse
- [x] Enregistrer `MailerModule` dans `AppModule`
- [x] Variables SMTP ajoutées dans `.env.example` et `.env.dev` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- [ ] Renseigner les variables SMTP dans `.env.prod` quand le client fournit ses accès

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

### 4.5.1. Migration KPI Store — Catalogue enrichi 114 KPIs (09/03/2026)

> Migration du catalogue de 39 KPIs (kpi.json) vers 114 KPIs uniques (kpi-bis.json).
> Schéma `KpiDefinition` enrichi, packs alignés sur les nouveaux plans.

#### Schéma Prisma — `KpiDefinition`

- [x] Nouveaux champs ajoutés au modèle `kpi_definitions` :
  - [x] `code String?` — code court du KPI (ex: `KPI-F01`)
  - [x] `domain String?` — domaine métier (ex: `Finance & Trésorerie`)
  - [x] `subcategory String?` — sous-catégorie (ex: `Revenus`)
  - [x] `usage String?` — cas d'usage métier
  - [x] `frequency String?` — fréquence de suivi (ex: `Mensuel / Annuel`)
  - [x] `risk String?` — niveau de risque : `Faible` | `Moyen` | `Élevé`
  - [x] `profiles String[]` — profils cibles : `["DAF", "CFO", "DG"]`
  - [x] `sectors String[]` — secteurs applicables : `["Tous secteurs"]`
  - [x] `sqlSage100View String?` — vue Sage 100 principale
  - [x] `sqlSage100Tables String[]` — tables Sage 100 sous-jacentes
  - [x] `mlUsage String?` — usage ML / IA prédictif
- [x] `npx prisma db push` exécuté — schéma synchronisé en DB
- [x] `npx prisma generate` exécuté — client Prisma régénéré

#### Backend

- [x] `src/admin/dto/kpi-store.dto.ts` mis à jour :
  - [x] `CreateKpiDefinitionDto` : 11 nouveaux champs optionnels + `direction` (`HIGHER_IS_BETTER` | `LOWER_IS_BETTER`)
  - [x] `UpdateKpiDefinitionDto` : mêmes champs en `@IsOptional()`
  - [x] `@IsIn` sur `category` supprimé (catégorie libre)
  - [x] `@IsIn` sur `defaultVizType` étendu : `pie`, `map`, `text` ajoutés
  - [x] `CreateWidgetTemplateDto` : `vizType` étendu aux 8 types
- [x] `admin.service.ts` : aucune modification requise (`data: dto` passe les nouveaux champs automatiquement)

#### Seed (`prisma/seed.ts`)

- [x] Cleanup destructif en début de `main()` : `widget → nlqTemplate → nlqIntent → kpiPack → kpiDefinition`
- [x] Source changée de `kpi.json` → `kpi-bis.json`
- [x] Déduplication automatique des 12 clés en doublon (126 → 114 KPIs uniques)
- [x] Mapping complet de tous les nouveaux champs dans `kpiDefinition.create()`
- [x] Liste `LOWER_IS_BETTER_KEYS` pour les KPIs inversés (DSO, DPO, Taux Impayés, BFR…)
- [x] 3 nouveaux `WidgetTemplate` seedés : `pie`, `map`, `text` (total : 8 types)
- [x] 12 KPI Packs générés dynamiquement par catégorie (remplacent les 3 anciens)
- [x] `allowedKpiPacks` des plans mis à jour :
  - `essentiel` : `pack_finance`, `pack_tresorerie`
  - `business` : + `pack_clients`, `pack_fournisseurs`, `pack_stocks`, `pack_comptabilite`, `pack_analytique`, `pack_commandes`
  - `enterprise` : `all`
- [x] Seed ré-exécuté avec succès : 114 KPIs, 126 NlqIntents, 8 WidgetTemplates, 12 KpiPacks

#### Frontend Admin Cockpit

- [x] `src/types/index.ts` — interface `KpiDefinition` enrichie (11 nouveaux champs)
- [x] `src/features/kpi-store/CreateKpiDefinitionModal.tsx` :
  - [x] `category` : Select → Input texte libre
  - [x] `defaultVizType` : 8 types via constante `VIZ_TYPES`
  - [x] Nouveaux champs : `code`, `domain`, `subcategory`
- [x] `src/features/kpi-store/EditKpiDefinitionModal.tsx` : mêmes corrections
- [x] `src/features/kpi-store/KpiDefinitionDetailPage.tsx` :
  - [x] Affichage du `code` dans le header
  - [x] Grille étendue : `domain`, `subcategory`, `frequency`, `risk`, `direction`
  - [x] Badges `profiles[]` (violet) et `sectors[]` (gris)
  - [x] Carte "Source Sage 100" : `sqlSage100View` + `sqlSage100Tables[]`
  - [x] Carte "Usage ML / IA" : `mlUsage`

#### Documentation

- [x] `docs/backend/modules/kpi-store.md` — entièrement reécrit pour refléter les 114 KPIs et le nouveau schéma
- [x] `docs/TODO_Insight_Sage.md` — section 4.5.1 ajoutée (cette section)

***

## 4.6. Objectifs KPI (Targets)

### Modèle de données

- [x] Enums Prisma : `PeriodType` (MENSUEL / BIMESTRE / TRIMESTRE / SEMESTRE / ANNEE), `TargetValueType` (ABSOLUTE / PERCENTAGE / DELTA_PERCENT), `DeltaReference` (PREVIOUS_PERIOD / SAME_PERIOD_LAST_YEAR), `TargetScenario` (BUDGET / REVISED / FORECAST / STRETCH)
- [x] Modèle `Target` : `kpiKey`, `value`, `valueType`, `deltaReference?`, `periodType`, `periodIndex`, `year`, `scenario`, `label?`
- [x] Contrainte d'unicité : `organizationId + kpiKey + periodType + periodIndex + year + scenario`
- [x] Champ `direction` ajouté sur `KpiDefinition` (`HIGHER_IS_BETTER` | `LOWER_IS_BETTER`) pour l'affichage dashboard réel vs objectif
- [x] Back-relations ajoutées : `Organization.targets[]` et `KpiDefinition.targets[]`

### RBAC

- [x] Permissions `read:targets` et `manage:targets` ajoutées dans `DEFAULT_PERMISSIONS` (seed)
- [x] Rôles mis à jour dans le seed :
  - `owner` / `daf` : `read:targets` + `manage:targets`
  - `controller` : `read:targets` + `manage:targets`
  - `analyst` : `read:targets` (lecture seule)

### Module `src/targets/`

- [x] `src/targets/targets.module.ts`
- [x] `src/targets/targets.service.ts` — CRUD + validation periodIndex + upsert sur unicité + audit log
- [x] `src/targets/targets.controller.ts` — 4 endpoints RBAC + Swagger complet
- [x] `src/targets/dto/create-target.dto.ts`
- [x] `src/targets/dto/update-target.dto.ts`
- [x] `TargetsModule` enregistré dans `AppModule`

### Endpoints

- [x] `GET /targets` — liste avec filtres `kpiKey`, `year`, `periodType`, `scenario` (inclut `kpiDefinition` enrichi)
- [x] `GET /targets/:id` — détail
- [x] `POST /targets` — créer ou remplacer (upsert sur contrainte d'unicité)
- [x] `PATCH /targets/:id` — modifier `value`, `valueType`, `deltaReference`, `year`, `label`
- [x] `DELETE /targets/:id` — supprimer

### Commandes à exécuter après ce commit

- [ ] `npx prisma generate` — régénérer le client Prisma (nouveaux enums + modèle Target + champ direction)
- [ ] `npx prisma db push` — appliquer les changements de schéma sur la DB
- [ ] `npx ts-node prisma/seed.ts` — réinjecter permissions et rôles mis à jour

***

## 4.7. Facturation & Paiements (Billing Flutterwave)

> Migration Stripe → Flutterwave effectuée. Flutterwave est agréé localement au Sénégal, supporte XOF nativement et offre des virements bancaires en ~1 jour ouvré.

### Modèle de données

- [x] Enum `BillingStatus` : `TRIALING` | `ACTIVE` | `PAST_DUE` | `CANCELLED` | `UNPAID` | `PAUSED`
- [x] Modèle `BillingCustomer` : lien 1:1 Organisation → Customer FW (`fwCustomerId` nullable — renseigné par webhook)
- [x] Modèle `BillingSubscription` : abonnement actif (`fwSubscriptionId`, `planId`, `status`, `currentPeriodStart/End`, `cancelAtPeriodEnd`)
- [x] Modèle `BillingInvoice` : historique factures (`fwTransactionId`, `amountPaid` en XOF, `pdfUrl`, `hostedUrl`)
- [x] Champ `SubscriptionPlan.fwPlanId` : ID du Payment Plan Flutterwave (remplace `stripePriceId` + `stripeProductId` supprimé)
- [x] Back-relations sur `Organization` (`billingCustomer`, `billingSubscription`, `billingInvoices[]`)
- [x] Back-relation sur `SubscriptionPlan` (`billingSubscriptions[]`)

### Seed

- [x] Permissions `read:billing` et `manage:billing` dans `DEFAULT_PERMISSIONS`
- [x] Rôle `owner` : `read:billing` + `manage:billing`
- [x] Rôle `daf` : `read:billing` uniquement
- [x] Plans `essentiel`, `business`, `enterprise` avec `fwPlanId: null` (à renseigner après création dans FW Dashboard)

### Variables d'environnement

- [x] `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_SECRET_HASH` ajoutées dans `.env.example`

### Module `src/billing/`

- [x] `src/billing/billing.module.ts` — imports PrismaModule, UsersModule, AuditLogModule, MailerModule
- [x] `src/billing/billing.service.ts` — createCheckoutSession (FW Hosted Payment via axios), cancelSubscription, getSubscription, getInvoices
- [x] `src/billing/flutterwave-webhook.service.ts` — verifyWebhook (verif-hash) + handlers `charge.completed` + `subscription.cancelled`
- [x] `src/billing/billing.controller.ts` — 5 endpoints RBAC + Swagger + webhook public
- [x] `src/billing/dto/create-checkout.dto.ts`
- [x] `src/billing/dto/cancel-subscription.dto.ts`
- [x] `BillingModule` enregistré dans `AppModule`
- [x] `sendPaymentFailedAlert()` ajouté à `MailerService`
- [x] Package `stripe` désinstallé — `axios` utilisé à la place (déjà présent)

### Endpoints

- [x] `GET /billing/subscription` — statut abonnement + plan (read:billing)
- [x] `GET /billing/invoices` — historique factures (read:billing)
- [x] `POST /billing/checkout` — lien paiement Flutterwave Hosted Payment → `{ url }` (manage:billing)
- [x] `POST /billing/cancel` — annulation fin de période ou immédiate via API FW (manage:billing)
- [x] `POST /billing/webhook` — webhook public, hash `verif-hash` vérifié

### Webhook Flutterwave — Événements traités

- [x] `charge.completed` (status=successful + payment_plan) → activation/renouvellement abonnement + facture DB
- [x] `subscription.cancelled` → statut CANCELLED + email alerte propriétaire

### Audit Log

- [x] `billing_checkout_initiated`, `subscription_cancelled`, `payment_succeeded` ajoutés à `AuditEventType`

### Documentation

- [x] `src/billing/README.md` mis à jour (Flutterwave)
- [x] `docs/backend/modules/billing.md` mis à jour (Flutterwave)
- [x] `mkdocs.yml` — nav item `Facturation & Paiements: backend/modules/billing.md` existant

### Commandes exécutées

- [x] `npm uninstall stripe --legacy-peer-deps`
- [x] `npx prisma generate` — client Prisma régénéré (champs FW)
- [x] `npx prisma db push` — schéma synchronisé en DB

### Actions à faire dans Flutterwave Dashboard

- [ ] Créer le Payment Plan "Essentiel" (36 000 XOF/mois) → récupérer `plan_id` → `PATCH /admin/subscription-plans/:id { "fwPlanId": "plan_xxx" }`
- [ ] Créer le Payment Plan "Business" (100 000 XOF/mois) → même démarche
- [ ] Créer le Payment Plan "Enterprise" (300 000 XOF/mois) → même démarche
- [ ] Créer le webhook pointant vers `https://domaine.com/billing/webhook` (events: `charge.completed` + `subscription.cancelled`)
- [ ] Renseigner `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_SECRET_HASH` dans `.env.prod`

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

## 8.1. Audit de Sécurité — Plan de Remédiation (11/03/2026)

> Audit professionnel complet réalisé le 11/03/2026 sur la codebase `insightsage_backend`.
> Score de sécurité initial : **59 / 100** — Score cible après remédiation P0/P1 : **~78 / 100**
> Rapport complet disponible dans `docs/security/audit-2026-03-11.md` (à créer).

---

### 🔴 P0 — Critique (À corriger avant toute mise en production)

- [x] **Rate limiting global sur endpoints d’authentification** (`app.module.ts`, `auth.controller.ts`) ✅ 11/03/2026
  - [x] Installer `@nestjs/throttler` (`npm install @nestjs/throttler --legacy-peer-deps`)
  - [x] Enregistrer `ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])` dans `AppModule` + `APP_GUARD` `ThrottlerGuard`
  - [x] `@Throttle({ default: { limit: 5, ttl: 60000 } })` sur `POST /auth/login`
  - [x] `@Throttle({ default: { limit: 3, ttl: 3600000 } })` sur `POST /auth/forgot-password`
  - [x] `@SkipThrottle()` sur `POST /auth/logout` et `POST /auth/refresh`
  - [x] Rate limiting sur `POST /agents/register` (10/min) et `POST /agents/heartbeat` (120/min)

- [x] **Corriger le CORS WebSocket wildcard sur AgentsGateway et CockpitGateway** ✅ 11/03/2026
  - [x] `src/agents/agents.gateway.ts` : `origin: process.env.FRONTEND_URL || ‘http://localhost:3001’`
  - [x] `src/admin/cockpit.gateway.ts` : même correction

- [x] **Comparaison constant-time sur le webhook Flutterwave** (`src/billing/flutterwave-webhook.service.ts`) ✅ 11/03/2026
  - [x] Remplacer `signature === this.secretHash` par `timingSafeEqual(Buffer.from(signature), Buffer.from(this.secretHash))`
  - [x] Guard `if (!this.secretHash || !signature) return false;` + warning au démarrage si hash vide

---

### 🟠 P1 — Élevée (À corriger dans la semaine suivant la mise en prod)

- [x] **Swagger protégé par JWT (remplace la désactivation)** (`src/main.ts`) ✅ 11/03/2026
  - [x] Déplacé de `/api` vers `/docs` (hors du prefix global)
  - [x] Middleware Express vérifiant le JWT (header `Authorization: Bearer` ou cookie `swagger_token`)
  - [x] Mini-page de login HTML servie si token absent/invalide
  - [x] `persistAuthorization: true` dans Swagger UI options
  - [x] Titre renommé de `InsightSage API` → `Cockpit API`

- [x] **Ajouter Helmet pour les security headers** (`src/main.ts`) ✅ 11/03/2026
  - [x] `npm install helmet --legacy-peer-deps`
  - [x] `app.use(helmet({ contentSecurityPolicy: { ... } }))` dans `bootstrap()` avant `enableCors`

- [x] **Hacher les tokens de réinitialisation de mot de passe avant stockage** (`src/auth/auth.service.ts`) ✅ 11/03/2026
  - [x] Dans `forgotPassword()` : stocker `sha256(token)` en DB, retourner le token brut dans l’email
  - [x] Dans `resetPassword()` : hasher le token reçu avant la requête `findFirst`
  - [x] Helper privé `hashToken(token): string` ajouté au service

- [x] **Hacher les tokens d’invitation avant stockage** (`src/auth/auth.service.ts`) ✅ 11/03/2026
  - [x] Dans `inviteUser()` : stocker `sha256(token)` en DB, envoyer le token brut dans l’email
  - [x] Dans `register()` : hasher le token reçu avant `findUnique({ where: { token: hash } })`
  - ⚠️ **Note** : Les invitations en attente en DB (tokens en clair) sont invalidées — renvoyer les invitations existantes.

- [x] **Créer un DTO typé pour `POST /agents/query`** (`src/agents/agents.controller.ts`, nouveau fichier DTO) ✅ 11/03/2026
  - [x] Créer `src/agents/dto/execute-query.dto.ts` avec `@IsString() @IsNotEmpty() @MaxLength(4000) sql: string`
  - [x] Remplacer `@Body() dto: { sql: string }` par `@Body() dto: ExecuteQueryDto`

- [x] **Ajouter `PermissionsGuard` sur le NLQ controller** (`src/nlq/nlq.controller.ts`) ✅ 11/03/2026
  - [x] Ajouter `@UseGuards(SubscriptionGuard, PermissionsGuard)` sur la classe
  - [x] Ajouter `@RequirePermissions({ action: ‘read’, resource: ‘dashboards’ })` sur `POST /nlq/query`
  - [x] Ajouter `@RequirePermissions({ action: ‘write’, resource: ‘dashboards’ })` sur `POST /nlq/add-to-dashboard`

- [ ] **Risque injection SQL via remplacement de placeholders string** (`src/agents/agents.service.ts` lignes 600-609)
  - [ ] Valider chaque clé de placeholder via une allowlist stricte (`databaseName`, `schema`, etc.)
  - [ ] Valider les valeurs contre des patterns attendus (alphanumérique + tirets uniquement, pas de guillemets ni points-virgules)

- [ ] **Token preview agent retourné dans les réponses de statut** (`src/agents/agents.service.ts` ~ligne 492)
  - [ ] Supprimer `tokenPreview` des réponses de `getAgentById` et `getAgentStatus`
  - [ ] Le token complet ne doit être exposé qu’une seule fois à la génération initiale

- [ ] **Validation incomplète sur `InviteUserDto`** (`src/auth/dto/invite-user.dto.ts`)
  - [ ] Ajouter `@MaxLength(100)` + `@MinLength(1)` sur `firstName` et `lastName`
  - [ ] Ajouter `@IsIn([‘owner’, ‘daf’, ‘controller’, ‘analyst’])` sur le champ `role`

---

### 🟡 P2 — Moyenne (À planifier dans le sprint suivant)

- [x] ✅ 11/03/2026 **Migrer le rate limiter SQL vers Redis** (`src/agents/agents.service.ts`)
  - [x] Créé `src/redis/redis.module.ts` — client `node-redis` global, configuré via `REDIS_URL`
  - [x] Ajouté `RedisModule` dans `AppModule` (global) et `AgentsModule`
  - [x] `checkRateLimit` migré vers `INCR` + `EXPIRE` atomique (clé `sql_rl:{organizationId}`)
  - [x] Fail-open si Redis indisponible (warning loggé, requête non bloquée)
  - [x] `REDIS_URL` ajouté dans `.env.example`

- [x] ✅ 11/03/2026 **Déplacer la logique Prisma de `getJobStatus` vers `AgentsService`** (`src/agents/agents.controller.ts:238`)
  - [x] Ajouté `getJobById(jobId: string, organizationId: string)` dans `AgentsService` avec isolation tenant
  - [x] Supprimé le cast `(this.agentsService as any).prisma` du contrôleur

- [x] ✅ 11/03/2026 **Gérer le cas `FLW_SECRET_HASH` vide au démarrage** (`src/billing/flutterwave-webhook.service.ts`)
  - [x] Warning constructeur si `FLW_SECRET_HASH` vide
  - [x] `verifyWebhook` retourne `false` si secret non configuré (fail-closed)

~~- [ ] **Supprimer / sécuriser `docs/.brouillon.md`** (credentials Supabase en clair)~~ exclu puisque ce n'est pas poussé sur git
~~- [ ] Vérifier que ce fichier est dans `.gitignore`~~
~~- [ ] Effectuer la rotation des credentials Supabase exposés~~
~~- [ ] Supprimer ou anonymiser le fichier~~

- [ ] **Cache Redis pour les permissions** (`src/auth/guards/permissions.guard.ts`)
  - [ ] Implémenter un cache `user:permissions:{userId}` avec TTL 5 minutes pour éviter la requête DB à chaque request
  - [ ] Invalider le cache lors d'une modification de rôle ou de permission dans `RolesService` / `UsersService`

- [ ] **Blacklist des refresh tokens à la déconnexion** (`src/auth/auth.service.ts`)
  - [ ] Stocker le hash du refresh token révoqué en Redis avec TTL = durée restante du token (7j)
  - [ ] Vérifier la blacklist dans `JwtRefreshStrategy.validate()` avant de délivrer un nouvel access token

- [ ] **Contournement de la validation SQL via identifiants entre backticks** (`src/agents/sql-security.service.ts`)
  - [ ] La regex `\b` ne couvre pas les formes `` `DROP` `` ou `[DROP]` (dialects SQL Server / MySQL)
  - [ ] Pré-normaliser la requête (strip backticks/crochets) avant le passage aux regex de blacklist

- [ ] **Supprimer les casts `(this.prisma as any)`** (`src/admin/admin.service.ts`)
  - [ ] Régénérer le client Prisma (`npx prisma generate`) pour obtenir les types `BillingCustomer`, `BillingSubscription`, `BillingInvoice`
  - [ ] Remplacer tous les accès via `as any` par les types Prisma corrects

---

### 🔵 P3 — Faible (Backlog sécurité)

- [x] ✅ 11/03/2026 **Initialiser Sentry dans `main.ts`** (`src/main.ts`)
  - [x] `import * as Sentry from ‘@sentry/node’` + `Sentry.init({ dsn, environment })` si `SENTRY_DSN` défini
  - [x] `SENTRY_DSN` ajouté dans `.env.example` (vide = désactivé)

- [x] ✅ 11/03/2026 **Augmenter le facteur bcrypt de 10 à 12** (`src/auth/auth.service.ts`)
  - [x] `bcrypt.hash(password, 10)` → `12`, `bcrypt.hash(dto.newPassword, 10)` → `12`, `bcrypt.hash(refreshToken, 10)` → `12`

- [x] ✅ 11/03/2026 **Remplacer les valeurs faibles dans `.env.example`**
  - [x] `JWT_SECRET` → `"<generate: openssl rand -base64 64>"`
  - [x] `JWT_REFRESH_SECRET` → `"<generate: openssl rand -base64 64>"`
  - [x] `ADMIN_PASSWORD` → `"<define a strong password>"`
  - [x] `ADMIN_COOKIE_SECRET` → `"<generate: openssl rand -base64 32>"`
  - [x] `ADMIN_SESSION_SECRET` → `"<generate: openssl rand -base64 32>"`

- [x] ✅ 11/03/2026 **Supprimer l’origine `null` du CORS en développement** (`src/main.ts`)
  - [x] Bloc `allowedOrigins.push(‘null’)` supprimé

- [ ] **Remplacer `console.error` par le logger Winston** (`src/logs/audit-log.service.ts`, `src/redis/redis.module.ts`)
  - [ ] Utiliser `this.logger.error(...)` (NestJS `Logger`) partout où `console.error` est appelé

- [ ] **Configurer HSTS explicitement dans Helmet** (`src/main.ts`)
  - [ ] `hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }` dans les options `helmet()`

- [ ] **Lockout de compte après N tentatives de connexion échouées** (`src/auth/auth.service.ts`)
  - [ ] Compteur Redis `login:fail:{email}` incrémenté à chaque échec, TTL 15min
  - [ ] Retourner `429 Too Many Requests` après 10 échecs consécutifs

- [ ] **Rate limiting mot de passe oublié par email** (`src/auth/auth.controller.ts`)
  - [ ] En complément du throttle par IP : limiter à 1 demande/heure par adresse email (clé Redis `pw_reset:{email}`)

- [ ] **Désactiver `unsafe-inline` CSP pour Swagger en production** (`src/main.ts`)
  - [ ] `scriptSrc: isProd ? ["’self’"] : ["’self’", "’unsafe-inline’"]` — Swagger désactivé ou nonces en prod

---

### ℹ️ Informationnelle (Améliorations futures)

- [x] ✅ 11/03/2026 Renommer le titre Swagger de `InsightSage API` → `Cockpit API` pour ne pas exposer le nom interne
- [ ] Ajouter des tests d’intégration couvrant les cas de sécurité : IDOR, cross-tenant, brute-force, escalade de rôle
- [ ] Ajouter `security.txt` (RFC 9116) sur le domaine de production pour le responsible disclosure
- [ ] Vérifier que les cookies de refresh token ont bien les flags `HttpOnly`, `Secure` et `SameSite=Strict` en production (`src/auth/auth.controller.ts`)
- [ ] Créer le rapport complet d’audit dans `docs/security/audit-2026-03-11.md` (synthèse technique détaillée pour archivage)

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

- [x] Planifier des points réguliers avec le Product Owner pour valider :  
  - [x] Onboarding, UX des cockpits, logique métier.
- [ ] Synchroniser avec le Data Engineer sur :  
  - [ ] Interface entre API et semantic layer / DWH.  
  - [ ] Tests de performance sur requêtes clés NLQ et dashboards.
- [x] Partager les specs d’API avec le développeur front (contrat clair, exemples de payloads).
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

***

## 12. Optimisations et Usages Potentiels de Redis

- [ ] **1. Le vrai Cache Métier (Remplacer le cache Postgres)** :
  - **Problème actuel :** Le frontend sollicite la base Postgres (`AgentJob`) toutes les X secondes pour vérifier si des KPIs calculés récemment (moins de 5 min) existent déjà.
  - **Action :** Implémenter le `CacheModule` de NestJS backé par `cache-manager-redis-store`. Mettre en cache JSON le résultat de `executeRealTimeQuery` pendant 300s.
  - **Avantages :** 
    - Temps d'accès aux KPIs < 1ms (chargé depuis la RAM) au lieu d'une requête SQL.
    - Économie massive de CPU sur la base de données principale.
  - **Où l'utiliser :** Dans `agents.service.ts` lors du traitement et de la vérification de la présence d'un résultat côté client.

- [ ] **2. Scale-out des WebSockets (Adaptateur Pub/Sub)** :
  - **Problème actuel :** En cas d'augmentation du trafic, si l'on multiplie les pods du Backend (ex: 3 instances), un Agent connecté sur l'Instance A ne pourra pas répondre en temps réel à l'utilisateur connecté en WebSocket sur l'Instance B.
  - **Action :** Utiliser `@nestjs/platform-socket.io` combiné à `@socket.io/redis-adapter` relié à votre serveur Redis.
  - **Avantages :** Redis agira comme un bus de messagerie (Pub/Sub) invisible. Peu importe l'instance Backend recevant la réponse de l'Agent Sage, Redis la transférera instantanément à l'instance gérant l'utilisateur.

- [ ] **3. Gestion des tâches asynchrones lourdes (Files d'attente / Queues)** :
  - **Problème actuel :** Les exports lourds (PDF), les calculs complexes d'IA sur de gros volumes, ou des synchronisations Sage volumineuses bloquent l'Event Loop de Node.js et peuvent déclencher des "Timeout" si elles durent plus de 30 secondes.
  - **Action :** Installer `@nestjs/bull` ou `bullmq` qui utilise Redis de manière native pour empiler des travaux.
  - **Avantages :** 
    - Le contrôleur répond instantanément `{"status": "queued", "jobId": "123"}`.
    - Des "Workers" NestJS dédiés traitent la queue en arrière-plan sans ralentir l'API.

- [ ] **4. Blacklist de Tokens JWT & Sécurité** :
  - **Problème actuel :** Les JWT (Json Web Tokens) sont stateless. Si un compte Admin révoque un Utilisateur B, le token du B reste mathématiquement valide jusqu'à son expiration (ex: 7 jours).
  - **Action :** Lorsqu'un accès est révoqué via `revokeToken()`, injecter le hash du JWT dans Redis avec un TTL correspondant au temps restant de validité du token.
  - **Avantages :** Dans `JwtStrategy.validate()`, faire un rapide `redis.get(jwtHash)`. Si la clé existe, refuser l'accès. C'est le seul moyen sûr et performant (1ms) d'annuler un accès, sans faire de requêtes Postgres à chaque hit de l'API.

- [ ] **5. Compteurs Temps Réel pour les Dashboards (Billing/Usage)** :
  - **Action :** Vous utilisez déjà Redis pour le Rate Limiting (`INCR sql_rl:org_123`). Étendre cette utilisation pour les quotas d'abonnement.
  - **Exemples de métriques à traquer :**
    - `INCR usage:nlq:org_123:2026-03` → Nombre de requêtes NLP ce mois-ci.
    - `INCRBY usage:bandwidth:org_123:2026-03 <bytes_size>` → Poids des données renvoyées par l'agent.
  - **Avantages :** Ces compteurs en mémoire permettent au système de facturation (`billing.service.ts`) ou au Widget Store exclusif de limiter instantanément l'usage d'une Org qui dépasse le forfait PME ou Business, sans jamais peser sur les performances SQL avec des lourds `SELECT COUNT(*) WHERE month = ...`.

- [ ] **6. Cache des Permissions RBAC** *(référencé aussi en §8.1 P2)* :
  - **Problème actuel :** Le `PermissionsGuard` (`src/auth/guards/permissions.guard.ts`) effectue **2 à 3 requêtes Postgres** à chaque appel d'endpoint protégé : charger l'utilisateur, ses `UserRole`, puis les `Permission` associées. Sur un cockpit actif avec un DAF qui navigue, c'est des dizaines de requêtes DB inutiles par minute.
  - **Action :**
    - Lors du chargement des permissions dans `PermissionsGuard`, vérifier d'abord `redis.get('user:permissions:{userId}')`.
    - Si présent, désérialiser le JSON et utiliser directement.
    - Si absent, charger depuis Postgres puis stocker avec `redis.setEx('user:permissions:{userId}', 300, JSON.stringify(permissions))`.
  - **Invalidation :** Appeler `redis.del('user:permissions:{userId}')` dans `RolesService` et `UsersService` à chaque modification de rôle ou de permission.
  - **Clé Redis :** `user:permissions:{userId}` — TTL 5 minutes
  - **Avantages :** Réduction de ~70% des requêtes DB liées à la sécurité. Aucune dégradation de la sécurité (TTL court + invalidation explicite).

- [ ] **7. Rate Limiting par Email (Lockout Compte & Reset Password)** *(référencé aussi en §8.1 P3)* :
  - **Problème actuel :** Le `@Throttle` NestJS rate-limite par IP uniquement. Un attaquant derrière un proxy rotatif peut tenter le brute-force de N comptes différents sans être bloqué. De même, l'endpoint `forgot-password` peut être spammé par email sans limite par adresse.
  - **Action :**
    - **Lockout login :** Dans `AuthService.login()`, à chaque échec d'authentification, `redis.incr('login:fail:{email}')` + `redis.expire` à 900 secondes (15 min). Après 10 échecs, retourner `429 Too Many Requests` sans même vérifier le mot de passe.
    - **Reset password :** Dans `AuthService.forgotPassword()`, vérifier `redis.get('pw_reset:{email}')`. Si présent, retourner immédiatement `429`. Sinon, stocker `redis.setEx('pw_reset:{email}', 3600, '1')` (1 heure de cooldown).
  - **Clés Redis :**
    - `login:fail:{email}` — TTL 900s, compteur d'échecs
    - `pw_reset:{email}` — TTL 3600s, verrou reset password
  - **Avantages :** Protection ciblée par identité, complémentaire au throttle IP. Mitigation des attaques par credential stuffing et du spam d'emails de reset.

- [ ] **8. Socket.io Redis Adapter (Multi-Instance / Scale-Out WebSocket)** *(référencé aussi au §12.2 ci-dessus)* :
  - **Problème actuel :** `@nestjs/event-emitter` est in-process uniquement. Si le backend est déployé en plusieurs instances (plusieurs pods PM2 ou Docker), un Agent connecté à l'Instance A ne pourra pas envoyer ses résultats à un utilisateur DAF connecté en WebSocket sur l'Instance B.
  - **Action :**
    - Installer `@socket.io/redis-adapter` et `socket.io` (déjà présent).
    - Dans le bootstrap NestJS, après `app.listen()`, configurer l'adapter : `io.adapter(createAdapter(pubClient, subClient))`.
    - Créer deux clients Redis dédiés (pub + sub) depuis le `REDIS_URL` existant.
  - **Avantages :** Redis agit comme bus de messagerie Pub/Sub transparent entre instances. Les namespaces `/agents` et `/cockpit` fonctionnent correctement en multi-instance sans modifier une ligne de logique métier. Indispensable avant tout déploiement multi-pod.
  - **Dépendance NPM :** `npm install @socket.io/redis-adapter --legacy-peer-deps`

- [ ] **9. Queue Bull pour les Emails Transactionnels & Tâches Asynchrones** :
  - **Problème actuel :** `MailerService` envoie les emails de manière **synchrone** dans le fil de la requête HTTP (invitation, reset-password, welcome-setup). Si le serveur SMTP est lent ou indisponible, la requête API bloque et peut timeout. Il n'y a pas de mécanisme de retry.
  - **Action :** Utiliser `@nestjs/bull` (déjà installé, non utilisé) :
    - Créer une `email-queue` dans un `EmailModule` dédié.
    - Dans `AuthService.inviteUser()`, `forgotPassword()`, `AdminService.createClientAccount()` : remplacer l'appel direct `mailerService.send*()` par `emailQueue.add('send-email', { type, to, payload })`.
    - Créer un `EmailProcessor` (`@Processor('email-queue')`) avec `@Process('send-email')` qui appelle `MailerService` en background.
    - Configurer les retries : `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`.
  - **Autres tâches à queuer :** exports PDF de dashboards, rapports NLQ volumineux, nettoyage périodique des `AgentJob` expirés.
  - **Avantages :** Les endpoints répondent immédiatement. Retry automatique en cas d'échec SMTP. Monitoring de la queue via Bull Dashboard (optionnel). Aucun risque de saturation de l'Event Loop Node.js.
  - **Dépendances :** `@nestjs/bull` + `bull` sont déjà dans `package.json`. Ajouter `bull-board` pour le monitoring si besoin.

- [ ] **10. Health Check Redis dans `/health`** :
  - **Problème actuel :** L'endpoint `GET /health` vérifie la DB Postgres mais pas Redis. Si Redis tombe silencieusement, le rate limiter SQL passe en fail-open (warning loggé, mais aucune alerte remontée).
  - **Action :**
    - Dans `src/health/health.controller.ts`, ajouter un check Redis via `redis.ping()`.
    - Retourner `{ redis: 'up', latency_ms: X }` ou `{ redis: 'down', error: '...' }`.
    - Si Redis est critique (blacklist JWT activée), marquer le statut global `503`.
  - **Avantages :** Visibilité complète de l'infrastructure sur un seul endpoint. Monitoring externe (UptimeRobot, Sentry Crons) peut surveiller Redis via `/health`.

- [ ] **11. Remplacer `console.error` par le logger Winston dans Redis** *(référencé aussi en §8.1 P3)* :
  - **Problème actuel :** `src/redis/redis.module.ts` utilise `console.error()` pour les erreurs de connexion Redis. Ces erreurs n'apparaissent pas dans Winston et ne sont pas capturées par Sentry.
  - **Action :** Injecter le `Logger` NestJS dans `RedisModule` et remplacer `console.error(...)` par `this.logger.error(...)`.
  - **Avantages :** Toutes les erreurs Redis apparaissent dans les logs Winston structurés, et sont remontées dans Sentry si `SENTRY_DSN` est configuré.

***

## 13. Guide de Configuration de Sentry (Monitoring des Crashs)

Pour que Sentry joue parfaitement son rôle de "boîte noire" (capture des erreurs 500, alertes email immédiates, stack traces complètes) en production, voici les actions à réaliser côté Système / Infrastructure :

- [ ] **Étape 1 : Créer le projet côté Sentry**
  - Se rendre sur [sentry.io](https://sentry.io/) et créer ou se connecter à son compte.
  - Cliquer sur "Create Project", sélectionner la plateforme **Node.js** (ou **NestJS** si disponible).
  - Nommer le projet (ex: `insightsage-backend`).
  - Sentry génère alors une clé de routage **DSN** (Data Source Name) qui ressemble à `https://xyz123@o12345.ingest.sentry.io/45678`. Copier cette clé.

- [ ] **Étape 2 : Configurer les Variables d'Environnement**
  - Sur le serveur de production (là où tourne InsightSage), éditer le fichier `.env` à la racine.
  - Ajouter (ou modifier) les variables suivantes :
    ```env
    # Mettre ici l'URL DSN copiée à l'étape 1 (Active Sentry)
    SENTRY_DSN="https://xyz123@o12345.ingest.sentry.io/45678"
    
    # Préciser l'environnement pour trier les logs dans le Dashboard Sentry
    SENTRY_ENVIRONMENT="production"
    ```
  - Si le `SENTRY_DSN` est laissé vide, Sentry reste désactivé (comportement normal en développement local).

- [ ] **Étape 3 : Validation (Tester un crash d'API)**
  - Redémarrer le service Node.js sur le serveur (ex: `pm2 restart insightsage-backend`) pour qu'il prenne en compte le `.env`.
  - Le code applicatif gère déjà l'initialisation (`Sentry.init()`) grâce à l'intégration dans `src/main.ts`.
  - Pour vérifier le bon fonctionnement, ajouter temporairement un crash volontaire dans un contrôleur (ex: `app.controller.ts`) :
    ```typescript
    @Get('test-sentry-crash')
    crashTest() {
      throw new Error('Test Sentry : le serveur est en feu !');
    }
    ```
  - Appeler l'URL (ex: `https://api.mondomaine.com/test-sentry-crash`). L'API doit renvoyer une erreur 500.
  - Se rendre sur le Dashboard Sentry : l'erreur doit apparaître quasi-instantanément avec la ligne de code exacte (`app.controller.ts`). Un email d'alerte devrait également être envoyé.
  - Penser à retirer la route `test-sentry-crash` une fois la validation terminée !

***

## 14. Admin Cockpit — Améliorations UI (19/03/2026)

> Série d'améliorations UX/UI appliquées sur le frontend `admin-cockpit` (React + Vite + shadcn/ui).

### 14.1. Ajustements visuels globaux

- [x] **Zoom réduit de 10%** : `html { font-size: 80% }` dans `src/index.css` (était 90%).
- [x] **Largeur sidebar réduite** : `w-[260px]` → `w-[220px]` ; padding contenu ajusté en conséquence dans `MainLayout.tsx`.
- [x] **Sidebar — mode collapse** :
  - [x] Icônes des items nav centrées (`justify-center px-0` quand collapsed).
  - [x] Logo centré (`justify-center` sur le conteneur logo quand collapsed).
  - [x] Lien Settings (bas de sidebar) centré également.

### 14.2. Breadcrumb dynamique dans le Header

- [x] `PAGE_TITLE_MAP` dans `Header.tsx` : tableau regex → clé i18n + `parentPath` optionnel pour les pages de détail.
- [x] Toutes les routes couvertes (dashboard, organizations, users, roles, agents, audit-logs, invitations, health, settings, subscription-plans, client-plans, billing-subscriptions, dashboards, kpi-store, nlq-store + toutes leurs pages de détail).
- [x] Icône maison (`House`) cliquable → `/dashboard`.
- [x] Parent cliquable (NavLink) sur les pages de détail + séparateur ChevronRight + label "Détail".

### 14.3. Recherche globale — Command Palette (Ctrl+K)

- [x] Installation `cmdk` v1.1.1 (`npm install cmdk --legacy-peer-deps`).
- [x] Composant `src/components/ui/command.tsx` — wrapper cmdk v1 (API imports directs, `data-[selected=true]`).
- [x] Composant `src/components/shared/GlobalSearch.tsx` :
  - [x] 4 groupes : Navigation (15 pages statiques), Organisations, Utilisateurs, Agents.
  - [x] Données temps réel via hooks React Query existants (`useOrganizations`, `useAdminUsers`, `useAgents`).
  - [x] Filtrage client-side natif cmdk, max 5 résultats par groupe dynamique.
  - [x] Navigation + fermeture automatique au clic.
- [x] Bouton "Rechercher..." dans `Header.tsx` (desktop uniquement, `w-52`, badge `Ctrl+K`).
- [x] État `searchOpen` centralisé dans `MainLayout.tsx`.

### 14.4. Raccourcis clavier globaux

- [x] Hook `src/hooks/use-keyboard-shortcuts.ts` — centralise tous les raccourcis :
  - [x] `Ctrl+K` → ouvre la recherche globale.
  - [x] `Ctrl+\` → toggle sidebar.
  - [x] `Ctrl+Shift+L` → bascule thème clair/sombre.
  - [x] `?` → ouvre la cheatsheet (désactivé si focus dans un input).
  - [x] `G` + lettre → navigation directe (séquence 2 touches, timeout 500ms via `useRef`).
- [x] **Mapping G+lettre complet (15 pages)** :

  | Raccourci | Route |
  |---|---|
  | G+D | `/dashboard` |
  | G+O | `/organizations` |
  | G+U | `/users` |
  | G+I | `/invitations` |
  | G+R | `/roles` |
  | G+P | `/subscription-plans` |
  | G+C | `/client-plans` |
  | G+F | `/billing-subscriptions` |
  | G+T | `/dashboards` |
  | G+K | `/kpi-store` |
  | G+N | `/nlq-store` |
  | G+A | `/agents` |
  | G+L | `/audit-logs` |
  | G+H | `/health` |
  | G+S | `/settings` |

- [x] Bouton `Keyboard` dans le Header (desktop) → dispatch event `?` pour ouvrir la cheatsheet.
- [x] `useKeyboardShortcuts` appelé dans `MainLayout.tsx` (centralisation état `searchOpen`, `helpOpen`).

### 14.5. Cheatsheet raccourcis clavier

- [x] Composant `src/components/shared/KeyboardShortcutsHelp.tsx` — Dialog scrollable (`max-h-[80vh]`) :
  - [x] Section "Général" : Ctrl+K, Ctrl+\, Ctrl+Shift+L, `?`.
  - [x] Section "Navigation — G puis..." : les 15 raccourcis G+lettre.
  - [x] Composants `ShortcutRow` (clés `<kbd>`) et `Section` (titre uppercase).

### 14.6. Paramètres — section Raccourcis clavier

- [x] `SectionKey` enrichi : `'shortcuts'` ajouté.
- [x] Item `Keyboard` ajouté dans `NAV_GROUPS` (groupe Général, aux côtés de Notifications).
- [x] Section inline dans `SettingsPage.tsx` : même contenu que la cheatsheet modale, affiché dans une Card.
- [x] Clés i18n ajoutées dans `fr.ts` et `en.ts` : `sectionShortcuts`, `sectionShortcutsDesc`, `shortcutsGroupGeneral`, `shortcutsGroupNav`.

---

## 15. Intégrations n8n — Fonctionnalités potentielles à implémenter

> Le client a n8n installé. Les 4 cas d'usage ci-dessous ont été identifiés comme les plus à forte valeur pour le projet Cockpit. Chaque point décrit le besoin, l'architecture technique, les workflows n8n à construire et les impacts sur le backend NestJS.

---

### 15.1. Pipeline NLQ alimenté par IA (remplacement du moteur template-based)

**Contexte actuel**
Le module `nlq/` est un squelette vide. L'approche prévue était template-based : des requêtes SQL pré-écrites paramétrées par des variables. Cette approche est rigide, couteuse à maintenir et ne répond pas aux questions libres.

**Vision avec n8n + LLM**
Remplacer le template-based par un pipeline IA complet orchestré dans n8n, où le backend NestJS joue le rôle de dispatcher et de validateur de sécurité.

**Architecture du pipeline**

```
[User Frontend]
    │ POST /nlq/query { question: string, dashboardContext: object }
    ▼
[NestJS NlqController]
    │ 1. JwtAuthGuard + SubscriptionGuard (@RequiresFeature('hasNlq'))
    │ 2. Sanitize question (longueur max, blacklist injection)
    │ 3. Appel HTTP → n8n Webhook "nlq-pipeline"
    ▼
[n8n Workflow "nlq-pipeline"]
    │
    ├─ Node 1 : Receive Webhook
    │     Payload : { question, orgId, schemaContext, language }
    │
    ├─ Node 2 : Build Prompt
    │     Injecte le schéma Sage (tables ERP disponibles pour cet org)
    │     Injecte les règles métier (ex: "fiscal_year commence en juillet")
    │     Prompt système : "Tu es un assistant SQL pour Sage X3. Génère uniquement
    │      un SELECT valide. Ne jamais utiliser DROP, UPDATE, DELETE..."
    │
    ├─ Node 3 : OpenAI / Claude API
    │     Modèle : GPT-4o ou Claude Sonnet
    │     Temperature : 0 (déterministe)
    │     Réponse attendue : { sql: string, explanation: string }
    │
    ├─ Node 4 : SQL Validator
    │     Regex check : SELECT only, no comments, no subqueries non autorisés
    │     Si invalide → retourne { error: "unsafe_sql" }
    │
    ├─ Node 5 : Send SQL to Agent
    │     POST /agents/jobs { organizationId, sql, source: "nlq" }
    │     L'agent on-prem exécute la requête sur le Sage local
    │
    ├─ Node 6 : Wait for result (polling ou webhook retour)
    │     Timeout : 30s (même limite que AgentJob)
    │
    └─ Node 7 : Return to NestJS
          { sql, explanation, results: Row[], executionTimeMs }
    ▼
[NestJS]
    │ 4. Audit log de la question + requête SQL générée
    │ 5. Retourne au frontend
    ▼
[Frontend Dashboard]
    Affiche le tableau de résultats + explication en langage naturel
```

**Évolutions backend NestJS nécessaires**
- `NlqController.query()` : implémentation réelle avec appel HTTP vers n8n
- `NlqService.buildSchemaContext()` : récupère les tables disponibles pour l'org (config agent)
- `NlqService.auditNlqQuery()` : enregistre question + SQL + nombre de lignes dans AuditLog
- `NlqJobService` : gestion du statut (PENDING / COMPLETED / ERROR) pour les requêtes longues
- Nouveau champ `AgentJob.source` : `'manual' | 'nlq' | 'scheduled'`

**Configuration n8n**
- Credentials : OpenAI API Key ou Anthropic API Key (stockées dans n8n Credentials, jamais dans le code)
- Variable d'environnement NestJS : `N8N_NLQ_WEBHOOK_URL`
- Authentification webhook : Header secret partagé `X-Internal-Token`

**Avantages vs template-based**
- Questions libres en français ET anglais sans configuration
- Explication automatique en langage naturel (pédagogie pour le DAF)
- Évolution zero-code : améliorer le prompt dans n8n sans redeployer le backend
- Multi-modèle : switcher GPT ↔ Claude ↔ Mistral dans n8n sans toucher NestJS

---

### 15.2. Détection d'anomalies KPI

**Contexte**
Les organisations définissent des KPI dans `KpiDefinition`. Les valeurs réelles arrivent via l'agent on-prem (requêtes SQL sur Sage). Actuellement, aucun mécanisme ne compare les valeurs aux objectifs ni ne détecte les dérives.

**Vision**
Un workflow n8n cron tourne toutes les heures (ou toutes les nuits pour les KPI journaliers). Il compare les valeurs réelles aux cibles, calcule les écarts, et déclenche des alertes si des seuils sont franchis.

**Architecture du workflow n8n "kpi-anomaly-detection"**

```
[n8n Cron — toutes les heures]
    │
    ├─ Node 1 : Fetch Active Organizations
    │     GET /admin/organizations?status=ACTIVE (appel interne avec token superadmin)
    │
    ├─ Node 2 : Pour chaque org → Fetch KPI Definitions
    │     GET /kpis?organizationId=X (avec targets et thresholds)
    │
    ├─ Node 3 : Pour chaque KPI → Déclencher AgentJob
    │     POST /agents/jobs { sql: kpi.query, organizationId }
    │     Collecte les valeurs réelles en temps réel depuis Sage
    │
    ├─ Node 4 : Calcul d'anomalie
    │     Pour chaque KPI :
    │       deviation = (actual - target) / target * 100
    │       Si deviation > threshold → ANOMALY
    │     Types d'anomalies détectées :
    │       - Dépassement budget (ex: charges > budget +10%)
    │       - Chute de CA (ex: CA < objectif -15%)
    │       - Ratio critique (ex: DSO > 60 jours)
    │       - Tendance : 3 jours consécutifs en baisse
    │
    ├─ Node 5 : Si anomalie → POST /notifications/kpi-alert
    │     NestJS crée une notification in-app + WebSocket push vers CockpitGateway
    │     Format : { kpiName, actual, target, deviation, severity: 'warning'|'critical' }
    │
    ├─ Node 6 : Slack / Email alert (si severity = 'critical')
    │     n8n Slack node → channel #alerts-cockpit
    │     n8n Email node → DAF de l'organisation
    │
    └─ Node 7 : Audit log
          POST /audit/log { event: 'KPI_ANOMALY_DETECTED', metadata: {...} }
```

**Niveaux de sévérité**
| Sévérité | Seuil par défaut | Action |
|---|---|---|
| `info` | ±5% | Log uniquement |
| `warning` | ±10% | Notification in-app |
| `critical` | ±20% ou tendance 3j | Notification + Slack + Email |

**Évolutions backend NestJS nécessaires**
- Nouveau modèle Prisma `KpiAlert` : `{ id, kpiId, orgId, actual, target, deviation, severity, triggeredAt, acknowledgedAt? }`
- `NotificationsModule` : service + WebSocket event `kpi_alert` sur CockpitGateway
- Endpoint `POST /notifications/kpi-alert` : authentifié par token interne (pas JWT user)
- `KpiDefinition` : nouveaux champs `targetValue`, `warningThreshold`, `criticalThreshold`, `alertEnabled`
- Dashboard frontend : composant `KpiAlertBanner` + badge rouge sur les KPI en anomalie

**Valeur métier**
- Le DAF est alerté proactivement, sans avoir à consulter le dashboard
- Réduction du temps de détection des dérives budgétaires (de semaines à heures)
- Historique des anomalies pour audit et reporting mensuel

---

### 15.3. Moteur de segmentation et upsell

**Contexte**
`LicenseGuardianService` surveille déjà les limites (maxUsers, maxWidgets, maxKpis, maxAgentSyncPerDay). Mais rien n'est fait de ces données pour déclencher des actions commerciales ou d'engagement.

**Vision**
Un workflow n8n hebdomadaire segmente toutes les organisations par niveau d'usage, identifie les comptes "prêts à upgrader", et déclenche des séquences CRM/email ciblées.

**Architecture du workflow n8n "segmentation-upsell"**

```
[n8n Cron — chaque lundi 8h00]
    │
    ├─ Node 1 : Fetch All Organizations + Subscriptions
    │     GET /admin/organizations (avec plan actuel + usage stats)
    │
    ├─ Node 2 : Calcul du score d'usage pour chaque org
    │     Score = somme pondérée :
    │       - users : (currentUsers / maxUsers) * 30
    │       - widgets : (currentWidgets / maxWidgets) * 25
    │       - kpis : (currentKpis / maxKpis) * 25
    │       - syncs : (avgDailySyncs / maxAgentSyncPerDay) * 20
    │     Score normalisé 0-100
    │
    ├─ Node 3 : Classification en segments
    │     - "churning" : score < 20 et plan payant → risque de désabonnement
    │     - "stable" : score 20-60 → usage normal
    │     - "power_user" : score 60-80 → engagement fort
    │     - "upgrade_ready" : score > 80 OU une limite atteinte à > 90%
    │
    ├─ Node 4 : Actions par segment
    │
    │   [upgrade_ready]
    │     → POST /crm/contact { org, segment, suggestedPlan }
    │       (appel CRM Nafaka si disponible : HubSpot, Pipedrive, etc.)
    │     → n8n Email node : email personnalisé au Owner
    │       "Vous approchez de vos limites, passez au plan Business"
    │       avec lien deep-link vers /settings/billing
    │
    │   [churning]
    │     → Slack node : alerte #cs-cockpit "Compte X inactif depuis 14j"
    │     → Task CS créée dans CRM pour prise de contact
    │
    │   [power_user]
    │     → Notification in-app : "Découvrez les fonctionnalités avancées"
    │     → Invitation à un webinar ou démo des features premium
    │
    └─ Node 5 : Rapport hebdo → Slack #product-cockpit
          Résumé : { total_orgs, upgrade_ready: N, churning: N, power_users: N }
```

**Évolutions backend NestJS nécessaires**
- `GET /admin/organizations/usage-stats` : endpoint retournant usage actuel vs limites pour chaque org
- `POST /notifications/in-app` : endpoint générique pour push de notifications depuis n8n
- Nouveau modèle `OrgSegment` : `{ orgId, segment, score, computedAt }` — historique pour analytics
- Webhook interne sécurisé : `POST /internal/segment-update` avec token partagé

**Valeur métier**
- Identification automatique des comptes à convertir sans intervention manuelle
- Réduction du churn par détection proactive de l'inactivité
- Croissance MRR sans effort commercial supplémentaire (upsell automatisé)
- Dashboard Nafaka : courbe de segmentation dans le temps

---

### 15.4. Automatisation des opérations internes Nafaka

**Contexte**
Les opérations internes de l'équipe Nafaka (onboarding client, support, release) sont manuelles et non tracées. n8n peut automatiser ces workflows sans impacter le code produit.

**Vision**
Un ensemble de workflows n8n connectés aux outils internes de l'équipe (Slack, Notion, email, GitHub) pour automatiser le cycle de vie client de bout en bout.

**Workflow 1 : Onboarding automatisé nouveau client**

```
[Trigger : POST /webhooks/new-organization depuis NestJS]
    │ (appelé dans OrganizationsService.create() via HTTP)
    │
    ├─ Créer workspace Notion "Client : {orgName}"
    │     Template : fiche client (plan, contacts, config Sage, SLA)
    │
    ├─ Envoyer Slack message → #onboarding-cockpit
    │     "Nouveau client {orgName} — Plan {plan} — Owner : {email}"
    │
    ├─ Créer task dans Notion/Linear
    │     "Appel de bienvenue J+1 avec {ownerEmail}"
    │
    ├─ Email automatique Owner (J+0) : "Bienvenue chez Cockpit"
    │     (distinct du welcome-setup envoyé par NestJS — plus commercial)
    │
    ├─ Email J+3 : "Avez-vous configuré votre agent ?"
    │     (vérifie si agent lié, sinon envoie guide)
    │
    └─ Email J+7 : "Votre premier rapport KPI est prêt"
          (si KPI configurés, sinon "Configurez vos premiers KPI")
```

**Workflow 2 : Alertes support et incidents**

```
[Trigger : POST /health retourne status != 'ok']
    │ (n8n poll GET /health toutes les 5 minutes)
    │
    ├─ Slack #incidents : "⚠️ Health check failed — {details}"
    ├─ PagerDuty / appel téléphonique si durée > 10min
    └─ Création ticket support automatique
```

**Workflow 3 : Rapport mensuel automatique**

```
[n8n Cron — 1er du mois, 7h00]
    │
    ├─ GET /admin/stats { period: 'last_month' }
    │     { newOrgs, churnedOrgs, totalMRR, activeAgents, nlqQueries }
    │
    ├─ Générer rapport PDF via n8n (HTML → PDF node)
    │
    ├─ Email → équipe Nafaka : rapport mensuel
    │
    └─ Post Slack #metrics : résumé 5 lignes avec emojis
```

**Workflow 4 : Release & changelog**

```
[Trigger : GitHub webhook sur merge vers main]
    │
    ├─ Extraire commits depuis merge PR
    ├─ Appel LLM (GPT-4o) : "Génère un changelog en français"
    ├─ Créer page Notion "Release vX.X.X — {date}"
    └─ Slack #releases : "🚀 Nouvelle version deployée — {changelog_summary}"
```

**Configuration n8n globale pour ces workflows**
- Variables d'environnement n8n : `NESTJS_INTERNAL_URL`, `NESTJS_INTERNAL_TOKEN`, `SLACK_WEBHOOK_URL`, `NOTION_API_KEY`, `GITHUB_WEBHOOK_SECRET`
- Endpoints NestJS à ajouter :
  - `POST /webhooks/new-organization` : déclenché dans `OrganizationsService.create()`
  - `GET /admin/stats` : statistiques agrégées (orgs actives, MRR, usage)
- Sécurité : tous les webhooks entrants NestJS ← n8n validés par `X-Internal-Token` header

**Valeur métier**
- Onboarding client 100% automatisé : zéro action manuelle pour les cas standards
- Détection d'incidents en 5 minutes (vs découverte par le client)
- Rapports mensuels sans effort de rédaction
- Changelog automatique : communication produit sans friction