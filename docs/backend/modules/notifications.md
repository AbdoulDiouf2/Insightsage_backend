---
title: Module Notifications Admin
description: Alertes email aux administrateurs — nouveaux clients, agents hors ligne, paiements, erreurs
---

# Module Notifications Admin

Le module `NotificationsModule` centralise l'envoi d'alertes email aux administrateurs désignés lors d'événements système importants. Il se branche sur le `SystemConfig` singleton pour lire les préférences et la liste des destinataires configurés depuis la page Paramètres.

---

## Architecture

```
src/notifications/
  notifications.module.ts    ← Module NestJS (importé par les modules consommateurs)
  notifications.service.ts   ← Service cross-cutting — 5 types d'alertes
```

---

## Configuration (SystemConfig)

Les préférences de notification sont stockées dans la table `system_config` (singleton `id = 'default'`) au format JSON :

```json
{
  "notif": {
    "newOrg":        true,
    "agentOffline":  true,
    "paymentFailed": true,
    "paymentSuccess": false,
    "errorLogs":     true
  },
  "recipients": [
    "uuid-admin-1",
    "uuid-admin-2"
  ]
}
```

!!! info "Gestion depuis l'interface"
    Les préférences se configurent dans l'onglet **Paramètres → Général → Notifications** de l'Admin Cockpit.
    Les destinataires sont des IDs d'utilisateurs admin — le service les résout en emails via Prisma.

---

## Endpoints de configuration

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| `GET` | `/admin/system-config` | `manage:all` | Lire la config courante |
| `PATCH` | `/admin/system-config` | `manage:all` | Mettre à jour les préférences |

```typescript
// PATCH /admin/system-config
{
  "notificationPreferences": {
    "notif": { "newOrg": true, "agentOffline": false, ... },
    "recipients": ["uuid1", "uuid2"]
  }
}
```

---

## Alertes disponibles

| Clé | Événement déclencheur | Service source |
|-----|-----------------------|----------------|
| `newOrg` | Nouvelle organisation créée | `auth.service.ts` (`signup`), `admin.service.ts` (`createClientAccount`) |
| `agentOffline` | Agent sans heartbeat > 2 min | `agents.service.ts` (`markStaleAgentsOffline`) |
| `paymentFailed` | Webhook Flutterwave `charge.failed` | `flutterwave-webhook.service.ts` |
| `paymentSuccess` | Webhook Flutterwave `charge.completed` | `flutterwave-webhook.service.ts` |
| `errorLogs` | Événement d'audit de type erreur | `audit-log.service.ts` (via `ERROR_ALERT_EVENTS`) |

---

## API du NotificationsService

```typescript
// Nouvelle organisation créée
notifyNewOrg(orgName: string, createdByEmail?: string): Promise<void>

// Agent passé hors ligne (heartbeat expiré)
notifyAgentOffline(agentName: string, orgName: string): Promise<void>

// Paiement échoué
notifyPaymentFailed(orgIdOrName: string, amount?: number, currency?: string): Promise<void>

// Paiement réussi
notifyPaymentSuccess(orgName: string, amount: number, currency: string): Promise<void>

// Événement d'erreur système (agent_error, agent_job_timeout, agent_token_expired…)
notifyErrorLog(eventType: string, orgIdOrName?: string, details?: string): Promise<void>
```

Toutes les méthodes sont **fire-and-forget** : appelées avec `.catch(() => {})` pour ne jamais bloquer le flux principal.

---

## Logique interne

Chaque méthode suit le même pattern :

```typescript
async notifyXxx(...args): Promise<void> {
  const { notif, recipients } = await this.getConfig();
  if (!notif.xxx || !recipients.length) return;          // ① Guard
  const users = await this.resolveRecipients(recipients); // ② Résolution IDs → emails
  await Promise.allSettled(                               // ③ Envoi (échecs ignorés)
    users.map(u => this.mailer.sendAdminXxxAlert(u.email, u.firstName, ...args))
  );
}
```

!!! success "Fail-safe"
    Si `SystemConfig` n'existe pas en DB, `getConfig()` retourne `{ notif: {}, recipients: [] }` — aucune alerte n'est envoyée et aucune erreur n'est levée.

---

## Alertes d'erreur centralisées

Les alertes de type `errorLogs` sont **déclenchées automatiquement** par l'`AuditLogService` pour tout événement appartenant à l'ensemble `ERROR_ALERT_EVENTS` :

```typescript
// src/logs/audit-log.service.ts
const ERROR_ALERT_EVENTS = new Set<AuditEventType>([
  'agent_error',
  'agent_job_timeout',
  'agent_token_expired',
]);
```

Dès qu'un de ces événements est loggué, l'alerte est envoyée sans qu'aucun autre service n'ait à l'appeler explicitement.

---

## Intégration dans les modules

Le `NotificationsModule` est importé dans :

| Module | Raison |
|--------|--------|
| `AuditLogModule` | Alertes centralisées pour `ERROR_ALERT_EVENTS` |
| `AgentsModule` | Alerte `agentOffline` via `markStaleAgentsOffline` |
| `BillingModule` | Alertes paiement Flutterwave |
| `AuthModule` | Alerte `newOrg` lors du signup |
| `AdminModule` | Alerte `newOrg` lors de la création admin |
| `AppModule` | Import global de cohérence |

---

## Emails générés

Voir [Emails transactionnels → Alertes admin](mailer.md#alertes-admin) pour le détail des templates HTML.
