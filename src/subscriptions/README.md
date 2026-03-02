# Subscriptions Module - InsightSage

Ce module gère les abonnements des clients d'InsightSage (ex: Startup, PME, Enterprise) via l'entité de base de données `SubscriptionPlan`.

## Rôle & Avantages de la Persistance BDD
Les plans sont gérés dynamiquement en base de données plutôt qu'en dur dans le code. Cela permet à l'équipe d'administration (SuperAdmin) de:
- Créer de nouveaux paliers facilement.
- Désactiver des offres obsolètes (`isActive: false`).
- Gérer les limites (nombre de widgets, requêtes).
- Préparer l'intégration dynamique avec la facturation (ex: `stripeProductId`).

## Endpoints

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| `GET`   | `/api/subscriptions/plans` | `@Public()` | Renvoie tous les plans actifs pour alimenter la sélection de la première étape de l'Onboarding. |

## Gestion (SuperAdmin)
La création et la modification des plans se font exclusivement en interne, soit via le seed `prisma/seed.ts` de démarrage, soit par un administrateur InsightSage via les endpoints SuperAdmin réservés.
