---
title: Module Logs d'audit
description: Audit logging global, masquage PII et consultation des événements
---

# Module Logs d'audit

Le module Audit Logs fournit un système de traçabilité complet et centralisé. L'`AuditLogService` est un service **global** injecté automatiquement dans tous les modules.

## Structure

```
src/logs/
├── logs.module.ts
├── logs.service.ts          (queries)
├── logs.controller.ts       (endpoints)
├── audit-log.module.ts      (@Global — exports AuditLogService)
└── audit-log.service.ts     (écriture + PII masking)
```

---

## AuditLogService (Global)

Marqué `@Global()`, ce service est disponible dans toute l'application sans import explicite.

### `log(data)`

Enregistre un événement d'audit unique :

```typescript
await this.auditLog.log({
  event: 'user_login',
  userId: user.id,
  organizationId: user.organizationId,
  payload: { email: user.email, ip: '192.168.1.1' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
});
```

### `logBatch(events)`

Enregistre plusieurs événements en une seule transaction Prisma `createMany`.

!!! success "Design fail-safe"
    L'`AuditLogService` **ne propage jamais les erreurs**. Si l'insertion en DB échoue,
    l'erreur est loggée en `console.error` mais n'interrompt pas le flux applicatif.

    ```typescript
    try {
      await this.prisma.auditLog.create({ data: sanitized });
    } catch (error) {
      console.error('[AuditLog] Erreur d\'enregistrement:', error);
      // Ne throw pas — non-fatal
    }
    ```

---

## Alertes admin automatiques (ERROR_ALERT_EVENTS)

L'`AuditLogService` déclenche automatiquement une alerte email aux administrateurs pour les événements critiques, sans qu'aucun autre service n'ait à le faire explicitement :

```typescript
const ERROR_ALERT_EVENTS = new Set<AuditEventType>([
  'agent_error',
  'agent_job_timeout',
  'agent_token_expired',
]);
```

Dès qu'un événement de cet ensemble est loggué via `log()`, l'`AuditLogService` appelle `NotificationsService.notifyErrorLog()` en fire-and-forget :

```typescript
if (ERROR_ALERT_EVENTS.has(data.event) && this.notifications) {
  const details = data.payload
    ? JSON.stringify(data.payload).slice(0, 200)
    : undefined;
  this.notifications
    .notifyErrorLog(data.event, data.organizationId ?? undefined, details)
    .catch(() => {});
}
```

!!! info "Condition d'envoi"
    L'alerte n'est envoyée que si la clé `errorLogs` est activée dans `SystemConfig.notificationPreferences` et qu'au moins un destinataire est configuré.

---

## Masquage PII (Données Personnelles)

Avant toute insertion, `sanitizePayload()` transforme récursivement le payload :

### Règles de masquage

| Clé contient | Transformation |
|-------------|----------------|
| `password`, `secret`, `token`, `hash` | `"[REDACTED]"` |
| `email` | `jean.dupont@acme.com` → `j***@acme.com` |
| Objet imbriqué | Récursion sur les propriétés |
| Tableau | Chaque élément récursivement |

### Exemple

=== "Payload original"
    ```json
    {
      "email": "marie.martin@acme.com",
      "password": "MotDePasse123!",
      "hashedRefreshToken": "eyJ...",
      "profile": {
        "contactEmail": "contact@acme.com"
      }
    }
    ```

=== "Payload sanitisé"
    ```json
    {
      "email": "m***@acme.com",
      "password": "[REDACTED]",
      "hashedRefreshToken": "[REDACTED]",
      "profile": {
        "contactEmail": "c***@acme.com"
      }
    }
    ```

---

## LogsService — Requêtes

### `findAll(orgId, filters)`

```typescript
interface AuditLogFilters {
  userId?: string;
  event?: string;
  startDate?: string;  // ISO 8601
  endDate?: string;    // ISO 8601
  limit?: number;      // Max 100, défaut 50
  offset?: number;
}
```

Retourne les logs avec pagination :

```typescript
{
  data: AuditLog[],
  meta: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

### `getEventTypes(orgId)`

Agrégation COUNT par type d'événement pour l'organisation :

```typescript
await prisma.auditLog.groupBy({
  by: ['event'],
  where: { organizationId: orgId },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
});
// → [{ event: 'user_login', count: 142 }, ...]
```

---

## Controller — Endpoints

### GET `/logs/audit`

**Accès :** `read:logs`

**Query params :**

| Paramètre | Type | Exemple |
|-----------|------|---------|
| `event` | string | `user_login` |
| `userId` | UUID | `uuid-user` |
| `startDate` | ISO 8601 | `2026-03-01T00:00:00Z` |
| `endDate` | ISO 8601 | `2026-03-02T23:59:59Z` |
| `limit` | 1–100 | `25` |
| `offset` | ≥ 0 | `50` |

**Réponse 200 :**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "user_login",
      "payload": { "email": "j***@acme.com" },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "2026-03-02T10:30:00Z",
      "user": { "id": "uuid", "firstName": "Jean", "lastName": "Dupont" },
      "organization": { "id": "uuid", "name": "Acme Corp" }
    }
  ],
  "meta": { "total": 245, "limit": 50, "offset": 0, "hasMore": true }
}
```

### GET `/logs/audit/events`

**Accès :** `read:logs`

**Réponse 200 :**
```json
[
  { "event": "user_login", "count": 142 },
  { "event": "agent_heartbeat", "count": 8640 },
  { "event": "nlq_executed", "count": 37 },
  { "event": "widget_added", "count": 18 }
]
```

---

## Catalogue complet des événements

### Authentification

| Événement | Description |
|-----------|-------------|
| `user_login` | Connexion réussie |
| `user_logout` | Déconnexion |
| `password_reset_requested` | Demande de reset mot de passe |
| `password_reset_completed` | Mot de passe réinitialisé |

### Gestion des utilisateurs

| Événement | Description |
|-----------|-------------|
| `user_created` | Nouveau compte créé |
| `user_updated` | Profil modifié |
| `user_deleted` | Compte supprimé |
| `user_invited` | Invitation envoyée |

### Gestion des rôles

| Événement | Description |
|-----------|-------------|
| `role_created` | Rôle personnalisé créé |
| `role_updated` | Rôle modifié |
| `role_deleted` | Rôle supprimé |

### Agents

| Événement | Description |
|-----------|-------------|
| `agent_token_generated` | Token agent généré |
| `agent_registered` | Agent enregistré au démarrage |
| `agent_heartbeat` | Heartbeat reçu |
| `agent_error` | Agent en état d'erreur |
| `agent_token_revoked` | Token révoqué |
| `agent_token_regenerated` | Token régénéré |
| `agent_token_expired` | Token expiré (détecté) |

### Onboarding

| Événement | Description |
|-----------|-------------|
| `subscription_plan_selected` | Étape 1 |
| `onboarding_step_completed` | Étape complétée |
| `datasource_configured` | Étape 3 Sage |
| `agent_linked` | Agent lié à l'org |
| `users_invited_bulk` | Invitations bulk |
| `onboarding_completed` | Wizard terminé |

### Organisations

| Événement | Description |
|-----------|-------------|
| `organization_created` | Org créée |
| `organization_updated` | Org modifiée |
| `organization_deleted` | Org supprimée |

### Dashboards & KPIs

| Événement | Description |
|-----------|-------------|
| `dashboard_created` | Dashboard créé |
| `dashboard_updated` | Dashboard modifié |
| `dashboard_deleted` | Dashboard supprimé |
| `widget_added` | Widget ajouté |
| `widget_updated` | Widget modifié |
| `widget_removed` | Widget supprimé |
| `nlq_executed` | Requête NLQ exécutée |
| `nlq_saved_to_dashboard` | Résultat NLQ sauvegardé |

---

## Rétention des données

!!! info "Politique de rétention"
    Les logs d'audit sont conservés **indéfiniment** par défaut.
    Lors de la suppression d'une organisation, les logs sont conservés avec `organizationId = null`
    (comportement `onDelete: SetNull`) pour préserver la traçabilité à des fins de conformité.

Pour une purge manuelle :

```sql
-- Supprimer les logs de plus d'un an
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';
```
