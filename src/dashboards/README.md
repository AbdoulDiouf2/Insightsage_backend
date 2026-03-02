# Dashboards Module - InsightSage

Ce module gère les tableaux de bord (cockpits) pour les utilisateurs d'InsightSage.

## Aperçu
Le module est en cours de développement. Il permettra aux utilisateurs de:
- Créer et configurer des tableaux de bord.
- Assigner des widgets aux tableaux de bord.
- Voir un cockpit personnalisé basé sur leur rôle (ex: CFO/DAF).

## Architecture (Future)
Le `DashboardsController` sera géré autour de l'entité `Dashboard` et sera conçu pour isoler les données par `organizationId` et vérifier les permissions de l'utilisateur (`read:dashboards`, `write:dashboards`, etc.).
