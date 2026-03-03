# Dashboards Module - InsightSage

Ce module gère les tableaux de bord (cockpits) personnalisés pour les utilisateurs d'InsightSage.

## Fonctionnalités
Le module est pleinement opérationnel et permet aux utilisateurs de :
- **Gestion de Dashboards** : Créer, modifier (nom, layout, par défaut) et supprimer des tableaux de bord.
- **Cockpit CFO/DAF** : Accéder à un cockpit par défaut ou personnalisé basé sur l'organisation.
- **Isolation Multi-tenant** : Garantie que les dashboards ne sont accessibles qu'aux membres de l'organisation propriétaire.
- **Contrôle d'Accès (RBAC)** : Vérification des permissions (`read:dashboards`, `write:dashboards`) via `PermissionsGuard`.

## Architecture
Le `DashboardsController` gère l'entité `Dashboard` en assurant une isolation stricte par `organizationId`. Le layout est stocké au format JSON (`{x, y, w, h}`) permettant une personnalisation flexible de l'affichage des widgets.
