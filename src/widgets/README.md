# Widgets Module - InsightSage

Ce module gère les composants individuels affichables sur les tableaux de bord (Cockpits) et le catalogue de widgets.

## Fonctionnalités Implémentées
- **Le `Widget Store`** : Catalogue central permettant de lister les KPI packs (filtrés par plan d'abonnement), les définitions de KPIs et les templates de widgets.
- **Packs de KPIs** : Support de packs métiers pré-définis (ex: Pack DAF, Pack DG, Pack Contrôleur) avec 5 KPIs essentiels (Revenue MoM, Gross Margin, EBITDA, etc.).
- **Gestion des Widgets** : Ajout, modification (configuration, position, type de visualisation) et suppression de widgets sur un dashboard.
- **Validation des Limites** : Vérification du nombre maximal de widgets autorisés selon le plan d'abonnement de l'organisation.
- **Statut Actif/Inactif** : Possibilité d'activer ou désactiver des KPIs individuellement.

## Templates & KPIs
Les widgets s'appuient sur des `kpi_definitions` (logique métier) et des `widget_templates` (visualisation : cartes, barres, lignes, jauges, tableaux) pour offrir une expérience analytique riche.
