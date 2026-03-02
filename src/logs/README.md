# Logs Module - InsightSage

Ce module centralise la gestion et la consultation des logs d'audit du système, en veillant au respect de l'isolation par tenant (Organisation).

## Rôle
Chaque action sensible (création d'organisation, requêtes NLQ, génération de jetons d'Agent, etc.) est enregistrée par le service `AuditLogService`. Ce module offre les endpoints pour que les clients (et super-admins) puissent visualiser ces traces d'audit.

## Endpoints

| Méthode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/api/logs/audit` | Récupérer les logs d'audit de son organisation avec pagination et filtres (date, userId, type d'événement, etc.) | `read:logs` |
| `GET` | `/api/logs/audit/events` | Liste tous les types d'événements disponibles pour l'organisation | `read:logs` |

## Isolation Multi-Tenant
Toutes les requêtes de ce module sont automatiquement filtrées sur le `@OrganizationId()` de l'utilisateur. Seul un SuperAdmin (via le module `Admin`) peut interroger des logs de manière globale hors de l'isolation.
