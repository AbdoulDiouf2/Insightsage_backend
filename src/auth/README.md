# Module Auth & RBAC (InsightSage)

Ce module gère toute l'authentification, la connexion des utilisateurs, et le contrôle d'accès basé sur les rôles (RBAC) pour le projet InsightSage. Il s'appuie sur `Passport`, `@nestjs/jwt`, `bcrypt` et s'interface avec `Prisma` pour le stockage en base de données.

> [!IMPORTANT]
> **SaaS Fermé (Closed SaaS)** : InsightSage n'autorise plus la création de compte au grand public. La création d'une organisation se fait exclusivement par les SuperAdmins via le module `Admin` (`POST /api/admin/clients`). L'endpoint public `/api/auth/register` est verrouillé et sert uniquement à rejoindre une organisation via un jeton d'invitation.

## Fonctionnalités Principales

1. **Connexion (`/auth/login`) et Déconnexion (`/auth/logout`)**
   - Génère un couple de tokens courts et longs : `access_token` (valide 15m) et `refresh_token` (valide 7j).
   - Le `refresh_token` est haché en base de données pour la sécurité.
   - La déconnexion invalide le `refresh_token` en le supprimant de la base de données.
2. **Rotation de Tokens (`/auth/refresh`)**
   - Valide le `refresh_token` envoyé dans le header `Authorization: Bearer <RT>`.
   - Regénère un nouveau couple Access/Refresh tokens pour maintenir la session active.
3. **Récupération de mot de passe**
   - `/auth/forgot-password` génère un jeton temporaire aléatoire permettant à l'utilisateur de réinitialiser son mot de passe (valide 1 heure). En développement, ce jeton est renvoyé dans la réponse HTTP.
   - `/auth/reset-password` vérifie le jeton et applique le nouveau mot de passe haché.
4. **Système d'Invitations et Inscription Collaborateur**
   - `/auth/invite` : Route protégée. Permet d'inviter un nouvel utilisateur dans une organisation spécifique. Protégée par **RBAC**: Réservé aux utilisateurs ayant la permission `manage:users`.
   - `/auth/register` : Ne sert plus qu'à finaliser l'inscription d'un collaborateur invité (nécessite le `invitationToken`).

## Routes API Disponibles

| Méthode | Route                | Description                                        | Protection (Guards)          |
|---------|----------------------|----------------------------------------------------|------------------------------|
| `POST`  | `/login`             | Authentification email/mot de passe                | *Aucune*                     |
| `POST`  | `/refresh`           | Renouvellement de l'Access Token                   | `@UseGuards(JwtRefreshGuard)`|
| `POST`  | `/logout`            | Déconnexion de la session courante                 | `@UseGuards(JwtAuthGuard)`   |
| `POST`  | `/forgot-password`   | Demande de lien de réinitialisation                | *Aucune*                     |
| `POST`  | `/reset-password`    | Modification du mot de passe avec le token         | *Aucune*                     |
| `POST`  | `/invite`            | Création d'un lien d'invitation (collaborateur)    | `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions({action: 'manage', resource: 'users'})` |
| `POST`  | `/register`          | Acceptation d'invitation (Collaborateur)           | *Aucune* (via Token d'invite)|

## RBAC : Contrôle d'Accès Dynamique par Permissions (Multi-Tables)

Le système exploite une architecture relationnelle RBAC dynamique (`UserRole` -> `Role` -> `RolePermission` -> `Permission`) plutôt qu'un champ texte statique.

**Pour protéger une route globale (ex: dashboards) :**
```typescript
@UseGuards(JwtAuthGuard)
@Get('me')
getMesDashboards() { ... }
```

**Pour restreindre l'accès à une permission spécifique :**
```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'settings' }) // Vérifie la matrice de permissions relationnelles de l'utilisateur
@Post('settings')
updateSettings() { ... }
```

## Postman / Tests Locaux

1. **Générer un client** : Appelez d'abord `POST /api/admin/clients` (Module Admin) pour créer la coquille de l'entreprise et récupérer un `setupToken`.
2. **Initialiser le mot de passe** : Appelez `POST /api/auth/reset-password` avec ce Token pour définir le mot de passe du DAF racine.
3. **Se Connecter** : Appelez `POST /api/auth/login` avec l'email du DAF et le mot de passe défini à l'étape 2. Vous recevrez un `accessToken` et un `refreshToken`.
4. **Inviter un collaborateur** : Appelez `POST /api/auth/invite` avec un *Bearer Token* = `accessToken`. Le retour contiendra un `token` d'invitation (dans la console).
5. **Rejoindre** : Le collaborateur appelle `POST /api/auth/register` en fournissant ses coordonnées, un mot de passe et le `invitationToken`.
