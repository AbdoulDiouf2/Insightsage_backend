# NLQ Module - InsightSage

Ce module gère l'interface de **Natural Language Querying** (Requêtage en langage naturel), permettant aux utilisateurs de poser des questions métier simples sur leurs données Sage.

## Architecture & Fonctionnement

L'implémentation repose sur un moteur hybride "Intent-to-SQL" sécurisé :

1.  **Détection d'Intention** : Le `NlqService` analyse le texte de l'utilisateur pour identifier une `NlqIntent` (ex: "Chiffre d'affaires") via une recherche de mots-clés pondérée.
2.  **Mapping de Template ERP** : Pour chaque intention, le système récupère le `NlqTemplate` SQL spécifique à la version de Sage du client (`Sage 100` vs `Sage X3`).
3.  **Injection & Scoping** : Le backend injecte dynamiquement le nom de la base de données du client via le placeholder `{{database_name}}` issu de la `sageConfig`.
4.  **Exécution Temps Réel** : La requête est envoyée via WebSocket à l'Agent Sage, qui exécute le SQL et renvoie le résultat JSON.
5.  **Normalisation** : Le résultat brut est transformé (ex: extraction de valeurs scalaires, cast numérique) pour être prêt à l'affichage.

## Endpoints

- `POST /nlq/query` : Analyse une question et lance l'exécution via l'agent.
- `POST /nlq/add-to-dashboard` : Transforme une réponse NLQ réussie en un widget permanent sur un dashboard.

## Sécurité

- **Sandbox SQL** : Validation stricte `SELECT` uniquement.
- **Whitelist** : Restriction aux tables autorisées.
- **Limitation** : Injection automatique de `TOP 1000` (SQL Server) ou `LIMIT 1000` (Postgres).
- **Isolation Tenant** : Chaque session est liée de manière immuable à l'`organizationId`.

## Modèle de Données

- `nlq_intents` : Catalogue des questions métier supportées.
- `nlq_templates` : Codes SQL paramétrables par ERP.
- `nlq_sessions` : Historique complet des requêtes, latences et intentions détectées.
