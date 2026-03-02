---
title: Référence API
description: Référence exhaustive de tous les endpoints InsightSage API
---

# Référence API

!!! info "Swagger interactif"
    En développement, tous les endpoints sont disponibles interactivement à :
    **`http://localhost:3000/api`**

    Authentification Swagger : cliquez **Authorize** et entrez `Bearer <votre_access_token>`.

## Base URL

```
http://localhost:3000/api  (développement)
https://api.cockpit.nafaka.tech/api  (production)
```

## Authentification

Toutes les routes protégées requièrent le header :

```http
Authorization: Bearer <access_token>
```

---

## Module Auth — `/auth`

### POST `/auth/login`

> Authentifier un utilisateur et obtenir des tokens JWT.

**Accès :** Public (`@Public`)

**Body :**
```json
{
  "email": "admin@acme.com",
  "password": "SecretPass123!"
}
```

**Réponse 201 :**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": {
    "id": "uuid",
    "email": "admin@acme.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "organizationId": "uuid-org"
  }
}
```

---

### POST `/auth/register`

> Créer un compte à partir d'un token d'invitation.

**Accès :** Public (`@Public`)

**Body :**
```json
{
  "email": "nouveau@acme.com",
  "password": "MonMotDePasse123!",
  "organizationName": "Acme Corp",
  "firstName": "Marie",
  "lastName": "Martin",
  "invitationToken": "token-reçu-par-email"
}
```

---

### POST `/auth/logout`

> Déconnecter l'utilisateur (invalide le refresh token en DB).

**Accès :** Authentifié

**Réponse 200 :** `{ "message": "Déconnexion réussie" }`

---

### POST `/auth/refresh`

> Renouveler l'access token via le refresh token.

**Accès :** Public (JwtRefreshAuthGuard)

**Header :** `Authorization: Bearer <refresh_token>`

**Réponse 200 :**
```json
{
  "accessToken": "nouveau_access_token",
  "refreshToken": "nouveau_refresh_token"
}
```

---

### POST `/auth/forgot-password`

> Demander un email de réinitialisation de mot de passe.

**Accès :** Public

**Body :** `{ "email": "user@acme.com" }`

**Réponse 200 :** `{ "message": "Email envoyé si le compte existe" }`

---

### POST `/auth/reset-password`

> Réinitialiser le mot de passe avec le token reçu par email.

**Accès :** Public

**Body :**
```json
{
  "token": "reset-token-7j",
  "newPassword": "NouveauMotDePasse123!"
}
```

---

### POST `/auth/invite`

> Inviter un utilisateur par email avec un rôle spécifique.

**Accès :** `manage:users` ou `manage:all`

**Body :**
```json
{
  "email": "nouveau@acme.com",
  "role": "daf",
  "organizationId": "uuid-org"
}
```

**Réponse 201 :**
```json
{
  "message": "Invitation envoyée",
  "invitationToken": "token-7j",
  "expiresAt": "2026-03-09T..."
}
```

---

## Module Users — `/users`

### GET `/users/me`

> Obtenir le profil de l'utilisateur connecté.

**Accès :** Authentifié

**Réponse 200 :**
```json
{
  "id": "uuid",
  "email": "user@acme.com",
  "firstName": "Jean",
  "lastName": "Dupont",
  "isActive": true,
  "organizationId": "uuid-org",
  "userRoles": [
    { "role": { "name": "daf", "permissions": [...] } }
  ]
}
```

---

### PATCH `/users/me`

> Mettre à jour son propre profil (firstName, lastName uniquement).

**Accès :** Authentifié

**Body :** `{ "firstName": "Jean-Pierre", "lastName": "Martin" }`

---

### GET `/users`

> Lister tous les utilisateurs de l'organisation.

**Accès :** `read:users`

**Réponse 200 :** `User[]`

---

### GET `/users/:id`

> Obtenir un utilisateur par ID.

**Accès :** `read:users`

---

### PATCH `/users/:id`

> Mettre à jour un utilisateur (admin).

**Accès :** `manage:users`

**Body :** `{ "firstName"?, "lastName"?, "isActive"? }`

---

### DELETE `/users/:id`

> Supprimer un utilisateur.

**Accès :** `manage:users`

---

## Module Organizations — `/organizations`

### GET `/organizations/me`

> Obtenir les informations de l'organisation courante.

**Accès :** Authentifié

**Réponse 200 :**
```json
{
  "id": "uuid-org",
  "name": "Acme Corp",
  "sector": "Manufacturing",
  "size": "pme",
  "sageType": "X3",
  "sageMode": "local",
  "subscriptionPlan": { "name": "business", "label": "Business" },
  "onboardingStatus": { "currentStep": 5, "isComplete": true },
  "_count": { "users": 12, "dashboards": 3 }
}
```

---

### PATCH `/organizations/me`

> Mettre à jour l'organisation courante.

**Accès :** Authentifié (owner/admin)

**Body :**
```json
{
  "name": "Acme Corp Updated",
  "sector": "Finance",
  "country": "France",
  "sageType": "X3",
  "sageMode": "local",
  "sageHost": "192.168.1.100",
  "sagePort": 1433
}
```

---

## Module Agents — `/agents`

### POST `/agents/register`

> Enregistrer un agent au démarrage.

**Accès :** Public (authentifié par `agentToken`)

**Body :**
```json
{
  "agent_token": "isag_abc123...",
  "sage_type": "X3",
  "sage_version": "9.0.3",
  "agent_name": "agent-prod-acme",
  "agent_version": "1.2.0"
}
```

**Réponse 201 :**
```json
{
  "success": true,
  "agentId": "uuid",
  "organizationId": "uuid-org",
  "status": "online"
}
```

---

### POST `/agents/heartbeat`

> Envoi du heartbeat (toutes les 30s).

**Accès :** Public (authentifié par `agentToken`)

**Body :**
```json
{
  "agentToken": "isag_abc123...",
  "status": "online",
  "errorCount": 0,
  "lastError": null
}
```

---

### POST `/agents/generate-token`

> Générer un nouveau token agent pour l'organisation.

**Accès :** `manage:agents`

**Body :** `{ "name": "agent-prod", "force": false }`

**Réponse 201 :**
```json
{
  "agentId": "uuid",
  "token": "isag_abc123...",
  "name": "agent-prod",
  "tokenExpiresAt": "2026-04-01T...",
  "message": "Copiez ce token maintenant — il ne sera plus visible."
}
```

---

### GET `/agents/status`

> Lister tous les agents de l'organisation avec leur statut.

**Accès :** `read:agents`

**Réponse 200 :**
```json
[
  {
    "id": "uuid",
    "name": "agent-prod",
    "status": "online",
    "lastSeen": "2026-03-02T10:30:00Z",
    "rowsSynced": 145823,
    "isExpiringSoon": false,
    "daysUntilExpiry": 25
  }
]
```

---

### GET `/agents/:id`

> Obtenir les détails d'un agent (token partiellement masqué).

**Accès :** `read:agents`

---

### POST `/agents/:id/regenerate-token`

> Régénérer le token d'un agent (nouveau TTL de 30j).

**Accès :** `manage:agents`

---

### POST `/agents/:id/revoke`

> Révoquer immédiatement le token d'un agent.

**Accès :** `manage:agents`

---

## Module Onboarding — `/onboarding`

### GET `/onboarding/status`

> Obtenir l'état du wizard d'onboarding.

**Accès :** Authentifié

**Réponse 200 :**
```json
{
  "currentStep": 3,
  "completedSteps": [1, 2],
  "isComplete": false,
  "organization": { "name": "Acme", "planId": "uuid-plan" }
}
```

---

### POST `/onboarding/step1`

> Étape 1 : Sélectionner le plan d'abonnement.

**Body :** `{ "plan": "business" }`

---

### POST `/onboarding/step2`

> Étape 2 : Configurer le profil de l'organisation.

**Body :**
```json
{
  "name": "Acme Corp",
  "sector": "Manufacturing",
  "size": "pme",
  "country": "France"
}
```

---

### POST `/onboarding/step3`

> Étape 3 : Configurer la connexion Sage ERP.

**Body :**
```json
{
  "sageType": "X3",
  "sageMode": "local",
  "sageHost": "192.168.1.100",
  "sagePort": 1433
}
```

---

### POST `/onboarding/agent-link`

> Lier un agent à l'organisation.

**Body :** `{ "agentToken": "isag_abc123..." }`

---

### GET `/onboarding/profiles`

> Obtenir la liste des profils métier disponibles.

**Réponse 200 :**
```json
[
  { "key": "daf", "label": "DAF / CFO" },
  { "key": "dg", "label": "DG — Directeur Général" },
  { "key": "controller", "label": "Contrôleur Financier" },
  { "key": "manager", "label": "Responsable de département" },
  { "key": "analyst", "label": "Analyste (lecture seule)" }
]
```

---

### POST `/onboarding/step4`

> Étape 4 : Sélectionner les profils métier.

**Body :** `{ "profiles": ["daf", "controller"] }`

---

### POST `/onboarding/step5`

> Étape 5 : Inviter des utilisateurs (ou reporter).

**Body :**
```json
{
  "invitations": [
    { "email": "daf@acme.com", "role": "daf" },
    { "email": "ctrl@acme.com", "role": "controller" }
  ],
  "inviteLater": false
}
```

---

## Module Admin — `/admin` (SuperAdmin uniquement)

> Tous les endpoints `/admin` requièrent la permission `manage:all`.

### POST `/admin/clients`

> Créer un nouveau compte client (org + admin DAF).

**Body :**
```json
{
  "organizationName": "Nouveau Client SAS",
  "adminEmail": "admin@client.com",
  "adminFirstName": "Marie",
  "adminLastName": "Dupont"
}
```

**Réponse 201 :**
```json
{
  "organizationId": "uuid-org",
  "userId": "uuid-user",
  "resetToken": "token-7j-pour-reset-password"
}
```

---

### GET `/admin/organizations`

> Lister toutes les organisations (tous tenants).

### GET `/admin/organizations/:id`

> Détails d'une organisation.

### PATCH `/admin/organizations/:id`

> Modifier une organisation.

**Body :** Champs optionnels : `name`, `sector`, `size`, `country`, `sageType`, `sageMode`, `planId`...

### DELETE `/admin/organizations/:id`

> Supprimer une organisation et toutes ses données (cascade).

---

### GET `/admin/users`

> Lister tous les utilisateurs (cross-tenant).

### POST `/admin/users`

> Créer un utilisateur directement (sans invitation).

**Body :**
```json
{
  "email": "user@acme.com",
  "password": "Temp123!",
  "firstName": "Jean",
  "lastName": "Dupont",
  "organizationId": "uuid-org",
  "roleIds": ["uuid-role-daf"]
}
```

### GET `/admin/users/:id`

> Détails d'un utilisateur.

### PATCH `/admin/users/:id`

> Modifier un utilisateur (`firstName`, `lastName`, `isActive`).

### DELETE `/admin/users/:id`

> Supprimer un utilisateur.

---

### GET `/admin/audit-logs`

> Consulter les logs d'audit (top 100, cross-tenant).

---

### GET `/admin/subscription-plans`

> Lister tous les plans.

### POST `/admin/subscription-plans`

> Créer un nouveau plan.

**Body :**
```json
{
  "name": "custom",
  "label": "Custom Enterprise",
  "priceMonthly": null,
  "maxUsers": null,
  "maxKpis": null,
  "maxWidgets": null,
  "allowedKpiPacks": ["finance", "stock", "ventes", "rh"],
  "hasNlq": true,
  "hasAdvancedReports": true,
  "sortOrder": 5
}
```

### GET `/admin/subscription-plans/:id`

> Détails d'un plan.

### PATCH `/admin/subscription-plans/:id`

> Modifier un plan (prix, limites, features, Stripe IDs).

### DELETE `/admin/subscription-plans/:id`

> Désactiver un plan (`isActive = false`).

---

### GET `/admin/dashboard-stats`

> Statistiques globales pour le dashboard SuperAdmin.

**Réponse 200 :**
```json
{
  "totalOrganizations": 42,
  "totalUsers": 318,
  "agents": {
    "online": 38,
    "offline": 3,
    "error": 1
  },
  "recentActivity": [...]
}
```

---

## Module Roles — `/roles`

### GET `/roles`

> Lister les rôles de l'organisation.

**Accès :** Authentifié

### GET `/roles/permissions`

> Lister toutes les permissions disponibles.

**Réponse 200 :**
```json
[
  { "id": "uuid", "action": "read", "resource": "users", "description": "Voir les utilisateurs" },
  { "id": "uuid", "action": "manage", "resource": "agents", "description": "Gérer les agents" }
]
```

### POST `/roles`

> Créer un rôle personnalisé.

**Body :**
```json
{
  "name": "finance-viewer",
  "description": "Accès lecture aux dashboards financiers",
  "permissionIds": ["uuid-read-dashboards", "uuid-read-logs"]
}
```

### GET `/roles/:id`

> Détails d'un rôle avec ses permissions.

### PATCH `/roles/:id`

> Modifier un rôle (non-système uniquement).

### DELETE `/roles/:id`

> Supprimer un rôle personnalisé.

---

## Module Logs — `/logs`

### GET `/logs/audit`

> Consulter les logs d'audit de l'organisation.

**Accès :** `read:logs`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `userId` | string | Filtrer par utilisateur |
| `event` | string | Ex: `user_login`, `agent_registered` |
| `startDate` | ISO 8601 | Date de début |
| `endDate` | ISO 8601 | Date de fin |
| `limit` | number | Max 100 (défaut: 50) |
| `offset` | number | Pagination |

**Réponse 200 :**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "user_login",
      "payload": { "email": "j***@acme.com" },
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-03-02T10:30:00Z",
      "user": { "firstName": "Jean", "lastName": "Dupont" }
    }
  ],
  "meta": { "total": 245, "limit": 50, "offset": 0, "hasMore": true }
}
```

---

### GET `/logs/audit/events`

> Résumé des types d'événements avec comptage.

**Accès :** `read:logs`

**Réponse 200 :**
```json
[
  { "event": "user_login", "count": 142 },
  { "event": "agent_heartbeat", "count": 8640 },
  { "event": "nlq_executed", "count": 37 }
]
```

---

## Module Health — `/health`

### GET `/health`

> Vérifier l'état de l'API.

**Accès :** Public

**Réponse 200 :** `{ "status": "ok", "timestamp": "2026-03-02T..." }`

---

## Module Subscriptions — `/subscriptions`

### GET `/subscriptions/plans`

> Lister les plans d'abonnement actifs (public, pas d'auth requise).

**Accès :** Public

**Réponse 200 :** `SubscriptionPlan[]` (filtrés `isActive: true`)

---

## Codes d'erreur

| Code | Signification | Cause courante |
|------|--------------|----------------|
| `400` | Bad Request | Validation DTO échouée |
| `401` | Unauthorized | Token absent, invalide ou expiré |
| `403` | Forbidden | Permission manquante ou cross-tenant |
| `404` | Not Found | Ressource inexistante |
| `409` | Conflict | Email déjà utilisé, token déjà existant |
| `500` | Internal Error | Erreur inattendue (voir Sentry) |

**Format d'erreur standard :**
```json
{
  "statusCode": 403,
  "message": "Cross-tenant access denied",
  "error": "Forbidden"
}
```
