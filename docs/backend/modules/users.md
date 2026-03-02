---
title: Module Utilisateurs
description: Gestion des utilisateurs, masquage PII et contrôle d'accès
---

# Module Utilisateurs

Le module Users gère les profils utilisateurs avec un accent particulier sur la protection des données sensibles (PII Masking). Il sépare les requêtes "safe" (pour les réponses API) des requêtes internes complètes.

## Structure

```
src/users/
├── users.module.ts
├── users.service.ts
├── users.controller.ts
└── dto/
    └── update-user.dto.ts
```

---

## UsersService — Référence

### Constante `SAFE_USER_SELECT`

Définit les champs **jamais exposés** dans les réponses API :

```typescript
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  emailVerified: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  organization: {
    select: { id: true, name: true }
  },
  userRoles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } }
        }
      }
    }
  },
  // EXCLUT TOUJOURS :
  // - passwordHash
  // - hashedRefreshToken
  // - resetPasswordToken
  // - resetPasswordExpires
};
```

---

### Méthodes publiques (sans PII)

#### `findByIdSafe(id)`

Retourne un utilisateur avec ses rôles et permissions. Utilisé pour les réponses API publiques.

#### `findAllByOrganization(orgId)`

Retourne tous les utilisateurs d'une organisation avec select safe.

#### `update(id, data)`

Met à jour les champs autorisés et retourne le profil safe.

#### `remove(id)`

Supprime l'utilisateur (onDelete: Cascade nettoie les UserRoles associés).

---

### Méthodes internes (avec champs sensibles)

!!! danger "Usage interne uniquement"
    Ces méthodes retournent les champs sensibles. Ne jamais les exposer directement via un controller.

#### `findByEmail(email)`

Retourne l'utilisateur complet (avec `passwordHash`). Utilisé uniquement par `AuthService.login()`.

#### `findById(id)`

Retourne l'utilisateur complet (avec `hashedRefreshToken`). Utilisé uniquement par `JwtStrategy.validate()`.

---

## Controller — Endpoints

| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| `GET` | `/users/me` | Authentifié | Profil personnel |
| `PATCH` | `/users/me` | Authentifié | Modifier son profil |
| `GET` | `/users` | `read:users` | Lister les utilisateurs de l'org |
| `GET` | `/users/:id` | `read:users` | Profil d'un utilisateur |
| `PATCH` | `/users/:id` | `manage:users` | Modifier un utilisateur |
| `DELETE` | `/users/:id` | `manage:users` | Supprimer un utilisateur |

!!! note "Restriction PATCH /users/me"
    Un utilisateur ne peut modifier que `firstName` et `lastName` via `/users/me`.
    La modification de `isActive`, `email` ou `roles` est réservée aux admins via `/users/:id`.

---

## DTO

```typescript
class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;  // Uniquement via manage:users
}
```

---

## Exemple de réponse safe

```json
{
  "id": "uuid-user",
  "email": "jean.dupont@acme.com",
  "firstName": "Jean",
  "lastName": "Dupont",
  "isActive": true,
  "emailVerified": false,
  "organizationId": "uuid-org",
  "organization": { "id": "uuid-org", "name": "Acme Corp" },
  "userRoles": [
    {
      "role": {
        "name": "daf",
        "isSystem": true,
        "permissions": [
          { "action": "read", "resource": "users" },
          { "action": "read", "resource": "dashboards" }
        ]
      }
    }
  ],
  "createdAt": "2026-02-01T10:00:00Z",
  "updatedAt": "2026-03-01T15:30:00Z"
}
```

---

## Gestion SuperAdmin (cross-tenant)

Via `/admin/users` (permission `manage:all`) :

```typescript
// Créer un utilisateur directement (sans invitation)
POST /admin/users
{
  "email": "user@client.com",
  "password": "TempPass123!",
  "firstName": "Marie",
  "lastName": "Martin",
  "organizationId": "uuid-org",
  "roleIds": ["uuid-role-daf"]
}
```

Les endpoints admin `/admin/users` utilisent le même `SAFE_USER_SELECT` pour la réponse.
