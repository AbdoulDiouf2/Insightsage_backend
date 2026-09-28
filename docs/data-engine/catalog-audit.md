# Audit statique du catalogue historique

Analyse statique des catalogues versionnés uniquement ; aucune base, vue Sage ou donnée de production interrogée. COMPATIBLE qualifie seulement une forme SELECT simple, pas une validation métier ni une compatibilité opérationnelle V2.

Sources : `prisma/kpi-bis.json` (seed actif) et `prisma/kpi.json` (catalogue historique). Les clés identiques entre sources restent deux entrées distinctes.

| Catégorie | Entrées |
| --- | ---: |
| COMPATIBLE | 24 |
| ADAPTABLE | 102 |
| INCOMPATIBLE | 45 |
| BROKEN | 0 |
| PLACEHOLDER | 10 |

Doublons de clés dans une même source : prisma/kpi-bis.json:f01_ca_ht, prisma/kpi-bis.json:f02_ca_ttc, prisma/kpi-bis.json:f03_marge_brute, prisma/kpi-bis.json:f04_taux_marge_brute, prisma/kpi-bis.json:a01_total_achats_ht, prisma/kpi-bis.json:a02_dpo, prisma/kpi-bis.json:a03_dettes_fournisseurs_echues, prisma/kpi-bis.json:s01_valeur_stock_total, prisma/kpi-bis.json:s02_taux_rotation_stocks, prisma/kpi-bis.json:s06_marge_par_article, prisma/kpi-bis.json:ml02_score_churn_client, prisma/kpi-bis.json:ml03_prevision_rupture_stock.

## Entrées cassées ou fictives

- `prisma/kpi-bis.json:f05_dso` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:f07_taux_impayes` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:c05_delai_moyen_paiement_client` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:c06_factures_echues_non_soldees` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:c07_score_risque_client` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:k02_balance_agee_clients` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:ml02_score_churn_client` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:ml03_prevision_rupture_stock` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:c09_creances_groupe_vs_externes` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.
- `prisma/kpi-bis.json:ml07_nlq_natural_language_query` — PLACEHOLDER : SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.

## Limites

Le rapport ne vérifie ni les colonnes, ni les vues réellement installées, ni la justesse des calculs, ni les permissions SQL, ni les templates créés ou modifiés directement en base. `INCOMPATIBLE` signifie qu’une traduction manuelle est nécessaire pour le contrat V2 ; cela ne prouve pas un défaut du KPI V1. Aucun SQL du catalogue ne doit être exécuté directement par le Query Planner V2.

Le détail de chaque entrée et sa justification sont dans `catalog-audit.json`.
