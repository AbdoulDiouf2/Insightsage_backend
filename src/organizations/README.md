# Organizations Module - InsightSage

Brique fondamentale du modèle Multi-Tenant d'InsightSage.

## Rôle
Toutes les données de l'application sont cloisonnées par le biais de ce module `Organizations`. Chaque utilisateur appartient à une organisation (`organizationId`).
Ce module offrira la logique métier autour d'un client (le tenant en lui-même) :  
- Mise à jour des informations d'une entreprise
- Gestion des paramètres globaux de l'organisation
- Configuration partagée entre les utilisateurs de l'organisation

## Endpoints

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| `GET` | `/api/organizations/me` | Authentifié | Retourne les détails de l'organisation courante du requérant, avec son `SubscriptionPlan` associé et son avancement (`OnboardingStatus`). |
| `PATCH` | `/api/organizations/me` | Administrateur (`DAF` / `Owner`) | Met à jour les informations globales de l'organisation courante (nom, taille, secteur, pays). |
