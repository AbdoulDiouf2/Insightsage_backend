# Module Roles (InsightSage)

Ce module gère le CRUD (Create, Read, Update, Delete) des rôles sur-mesure pour chaque organisation cliente (Tenant). Il s'intègre profondément au sein de notre **architecture RBAC Dynamique**.

## Rôles Systèmes vs Rôles Personnalisés

InsightSage est livré avec un set de "Rôles Systèmes" de base (ex: `superadmin`, `owner`, `daf`, `controller`, `analyst`).
- Les rôles systèmes ont `isSystem: true` et `organizationId: null`. Ils ne peuvent **jamais** être modifiés ni supprimés par les clients.
- Les clients peuvent créer de nouveaux rôles à travers ce module, qui auront `isSystem: false` et seront rattachés à leur `organizationId`.

## Permissions Relationnelles

Le contrôle d'accès n'est plus géré par un nom textuel ("daf"). Il est géré par la présence d'une ou plusieurs permissions relationnelles.
Chaque permission est la combinaison d'une **action** (ex: `read`, `manage`) et d'une **ressource** (ex: `users`, `dashboards`).

Une matrice de permissions globale est insérée en DB via `prisma/seed.ts`. Le client sélectionne les IDs de ces permissions lors de la création d'un rôle sur-mesure.

## Routes API Disponibles

| Méthode  | Route                  | Description                                                  | Protection (PermissionsGuard)                    |
|----------|------------------------|--------------------------------------------------------------|--------------------------------------------------|
| `GET`    | `/roles/permissions`   | Renvoie le dictionnaire entier des permissions du système.   | `@RequirePermissions({action: 'read', resource: 'roles'})` |
| `GET`    | `/roles`               | Liste les rôles "Systèmes" + ceux de l'organisation courante.| `@RequirePermissions({action: 'read', resource: 'roles'})` |
| `POST`   | `/roles`               | Crée un rôle sur-mesure pour l'organisation courante.        | `@RequirePermissions({action: 'manage', resource: 'roles'})`|
| `PATCH`  | `/roles/:id`           | Modifie le nom/description ou les permissions d'un rôle.     | `@RequirePermissions({action: 'manage', resource: 'roles'})`|
| `DELETE` | `/roles/:id`           | Supprime un rôle sur-mesure au sein d'une organisation.      | `@RequirePermissions({action: 'manage', resource: 'roles'})`|

## Intégration globale

Lorsqu'un utilisateur (associé à un rôle via `UserRoles`) s'authentifie, le `PermissionsGuard` (situé dans `src/auth/guards/permissions.guard.ts`) va :
1. Lire l'ID de l'utilisateur dans le JWT
2. Faire un JOIN massif (`userRoles > role > permissions > permission`)
3. Valider que cet utilisateur dispose bien du duo `{action, resource}` requis sur la route appelée.
4. *Exception : Le duo `{action: 'manage', resource: 'all'}` agit comme un bypass (SuperAdmin).*
