# Module Utilisateurs (InsightSage)

Ce module centralise la gestion des profils et la configuration des accès d'équipe au sein d'une organisation (Tenant).

Intimement lié au concept de **Multi-Tenancy**, ce module s'assure qu'aucun utilisateur ne peut interagir avec les données ou la liste d'employés d'une autre entreprise.

## 1. Endpoints de Gestion de Profil (`/api/users/me`)

Accessibles sans restrictions spécifiques par **n'importe quel collaborateur** disposant d'un compte actif.
Permet la gestion de l'identité personnelle.

| Méthode | Route              | Description                                        | Protection (Guards)          |
|---------|--------------------|----------------------------------------------------|------------------------------|
| `GET`   | `/users/me`        | Récupère les données de son profil                 | `@UseGuards(JwtAuthGuard)`   |
| `PATCH` | `/users/me`        | Met à jour son prénom ou nom                       | `@UseGuards(JwtAuthGuard)`   |

*Sécurité : L'utilisateur ne peut ni usurper ou modifier son `role`, ni forcer son transfert vers une autre `organizationId` via cet endpoint.*

## 2. Endpoints d'Administration d'Équipe (`/api/users`)

Accessibles **exclusivement par les administrateurs/DAF** (`@Roles('admin', 'daf')`).
Permet la de distribuer, modifier ou retirer les droits des autres collaborateurs de l'organisation.

| Méthode  | Route              | Description                                        | Protection (Guards)                    |
|----------|--------------------|----------------------------------------------------|----------------------------------------|
| `GET`    | `/users`           | Liste *uniquement* les membres de son organisation | `JwtAuthGuard, RolesGuard` + Multi-Tenant |
| `GET`    | `/users/:id`       | Détails d'un collaborateur spécifique              | `JwtAuthGuard, RolesGuard` + Multi-Tenant |
| `PATCH`  | `/users/:id`       | Modifier un badge ou promouvoir un accès           | `JwtAuthGuard, RolesGuard` + Multi-Tenant |
| `DELETE` | `/users/:id`       | Supprimer / Rendre Inactif un collaborateur        | `JwtAuthGuard, RolesGuard` + Multi-Tenant |

### Règles Métier Particulières (RBAC + Isolations)

Afin d'éviter tout chevauchement ou faille de sécurité horizontale, le `UsersController` garantit :
- **Filtrage Strict :** Un "TargetUser" ciblé par `:id` sera d'abord chargé, et le backend bloquera la transaction `403 Forbidden` si l'Organisation du chercheur ne correspond pas à celle de la cible.
- **Sécurité des Mots de Passe :** Le hash du mot de passe (`passwordHash`) et les jetons de récupération ne sont jamais transmis via les Endpoints GET RESTful grâce à l'utilisation systématique de commandes Prisma filtrées (`select`).
- **Auto-Verrouillage DAF :** Un Administrateur (`daf`) faisant appel à `/users/:id` ne peut pas s'auto-rétrograder ni s'auto-supprimer pour éviter qu'une organisation ne se retrouve sans superviseur originel.

## Exemples d'Appel (Postman)

Pour modifier le rôle d'un contrôleur de gestion :

```http
PATCH /api/users/<ID_DU_COLLABORATEUR>
Authorization: Bearer <ACCES_TOKEN_DU_DAF>
Content-Type: application/json

{
  "role": "controller"
}
```
