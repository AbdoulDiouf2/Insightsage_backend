# Health Module - InsightSage

Ce module fournit des points de terminaison pour vérifier l'état de santé (Health Checks) de l'API et de ses dépendances.

## Endpoints Principaux

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| `GET` | `/api/health` | Vérification basique de l'API (ping) | `@Public()` |
| `GET` | `/api/health/db` | Vérification de la connexion à la base de données (Prisma) | `@Public()` |

Ces routes permettent aux systèmes de monitoring (Kubernetes, AWS ELB, etc.) ou à l'UI Admin de vérifier que le backend est en vie et que la base de données répond correctement.
