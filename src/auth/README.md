# Système RBAC - InsightSage

## Architecture

Le système RBAC (Role-Based Access Control) d'InsightSage est basé sur une architecture **Permissions → Rôles → Utilisateurs** avec isolation multi-tenant.

## Guards

### 1. JwtAuthGuard (Global)
Authentifie les utilisateurs via JWT. Automatiquement appliqué à toutes les routes sauf celles marquées `@Public()`.

### 2. TenantGuard (Global)
Assure l'isolation multi-tenant. Vérifie que l'utilisateur a un `organizationId` valide.

### 3. PermissionsGuard
Vérifie les permissions granulaires. Utilisé avec `@RequirePermissions()`.

### 4. RolesGuard
Vérifie les rôles par nom. Utilisé avec `@Roles()`.

## Décorateurs

| Décorateur | Usage | Exemple |
|------------|-------|--------|
| `@Public()` | Route publique (bypass auth) | `@Public() @Get('health')` |
| `@RequirePermissions()` | Exiger des permissions | `@RequirePermissions({ action: 'manage', resource: 'users' })` |
| `@Roles()` | Exiger des rôles | `@Roles('daf', 'owner')` |
| `@CurrentUser()` | Obtenir l'utilisateur courant | `@CurrentUser() user` ou `@CurrentUser('id') userId` |
| `@OrganizationId()` | Obtenir l'organizationId | `@OrganizationId() orgId: string` |

## Permissions Disponibles

| Action | Resource | Description |
|--------|----------|-------------|
| `read` | `dashboards` | Voir les dashboards |
| `write` | `dashboards` | Créer/éditer des dashboards |
| `delete` | `dashboards` | Supprimer des dashboards |
| `read` | `widgets` | Voir les widgets |
| `write` | `widgets` | Créer/éditer des widgets |
| `read` | `users` | Lister les utilisateurs |
| `manage` | `users` | Inviter, éditer, supprimer des utilisateurs |
| `read` | `roles` | Voir les rôles et permissions |
| `manage` | `roles` | Créer, éditer, supprimer des rôles |
| `manage` | `agents` | Gérer les connexions Sage |
| `read` | `nlq` | Exécuter des requêtes NLQ |
| `write` | `nlq` | Sauvegarder les résultats NLQ |
| `read` | `logs` | Voir les logs d'audit |
| `manage` | `organization` | Gérer l'organisation |
| `manage` | `all` | SuperAdmin (toutes permissions) |

## Rôles Système

| Rôle | Description | Permissions |
|------|-------------|-------------|
| `superadmin` | Développeur InsightSage | `manage:all` |
| `owner` | Propriétaire organisation | Toutes sauf `manage:all` |
| `daf` | DAF / Administrateur | Toutes sauf `manage:all` |
| `controller` | Contrôleur financier | Lecture + écriture dashboards/widgets/NLQ |
| `analyst` | Analyste (lecture seule) | Lecture dashboards/widgets/NLQ |

## Endpoints Principaux

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| `POST` | `/api/auth/login` | Connexion classique | `@Public()` |
| `POST` | `/api/auth/register` | Inscription via invitation | `@Public()` |
| `POST` | `/api/auth/logout` | Déconnexion (révocation de token) | Authentifié |
| `POST` | `/api/auth/refresh` | Rafraîchir un Access Token avec un Refresh Token | `@Public()` avec Refresh |
| `POST` | `/api/auth/forgot-password` | Demander la réinitialisation de mot de passe | `@Public()` |
| `POST` | `/api/auth/reset-password` | Réinitialiser le mot de passe | `@Public()` |
| `POST` | `/api/auth/invite` | Inviter un nouvel utilisateur dans son organisation | `manage:users` |

## Utilisation dans un Controller

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, CurrentUser, OrganizationId } from '../auth/decorators';

@Controller('example')
export class ExampleController {
  // Route protégée par défaut (JwtAuthGuard + TenantGuard appliqués globalement)
  @Get('protected')
  protectedRoute(@CurrentUser('id') userId: string) {
    return { userId };
  }

  // Route avec permission spécifique
  @Get('admin')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'users' })
  adminRoute(@OrganizationId() orgId: string) {
    return { orgId };
  }

  // Route publique
  @Public()
  @Get('public')
  publicRoute() {
    return { message: 'Hello World' };
  }
}
```

## Audit Logging

Le service `AuditLogService` permet de tracer toutes les actions importantes :

```typescript
import { AuditLogService } from '../logs/audit-log.service';

@Injectable()
export class MyService {
  constructor(private auditLog: AuditLogService) {}

  async doSomething(user: User) {
    // ... logique métier
    
    await this.auditLog.log({
      organizationId: user.organizationId,
      userId: user.id,
      event: 'dashboard_created',
      payload: { dashboardId: '...' },
    });
  }
}
```
