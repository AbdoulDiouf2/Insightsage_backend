# Pilote `revenue_ht` — Gate 1 en cours, E2E bloqué

**Statut au 28 septembre 2026 : source `dbo.VW_FINANCE_GENERAL.ca_ht` validée, contrôle Sage direct partiel effectué, E2E Backend → Agent installé non exécuté.** La base Sage BIJOU a été autorisée pour ce projet en lecture seule. Les montants du tableau de fixtures ci-dessous restent fictifs et ne constituent pas une certification Sage. Le Gate 1 reste bloqué tant que le chemin complet et les neuf scénarios applicables ne sont pas vérifiés.

## Définition métier candidate et provenance

La source de vérité du candidat est **`dbo.VW_FINANCE_GENERAL.ca_ht`**. La vue calcule déjà l'indicateur depuis `F_ECRITUREC` ; Data Engine V2 ne recalcule pas cette formule. La date est exposée par `dt_jour`. Le contrôle sur six périodes Sage a confirmé que `SUM(ca_ht)` est identique avec ou sans `cg_num LIKE '70%'` ; le filtre redondant a donc été retiré du mapping V2.

Un débit sur compte 70 diminue donc le résultat, ce qui couvre une écriture d'avoir **si elle est comptabilisée de cette façon**. Aucun statut de facture ni `DO_Type` n'est appliqué : ces attributs ne font pas partie de cette formule comptable. Le catalogue contient deux `f01_ca_ht` concurrents dans `prisma/kpi-bis.json` et une définition `ca_ht` basée sur `VW_Finances_Clients_Flat` et `Type_Piece IN ('FA','FD')` dans `prisma/kpi.json`. Ces formules ne sont pas présumées équivalentes. Une validation métier doit trancher entre CA comptable et CA facturé avant activation.

Les métadonnées Sage BIJOU montrent `VW_FINANCE_GENERAL.ca_ht NUMERIC(38,6)`, `dt_jour DATE` et `annee_mois VARCHAR`; la devise réelle reste à confirmer. Les trous du calendrier et les écritures hors plage peuvent écarter des lignes. Aucun établissement, agence ou société interne n'est déclaré en `SecurityScope` : le RBAC actuel ne garantit que l'organisation. La socket Agent est liée à cette organisation côté serveur.

## Mapping et requêtes

Le registre pilote, activable seulement par `DATA_ENGINE_REVENUE_HT_PILOT_ENABLED=true`, définit la ressource `sage100:finance_general` sur `dbo.VW_FINANCE_GENERAL`, `ca_ht`, `dt_jour` et `annee_mois`. Seule la dimension `month` est exposée, sans filtre utilisateur. Les périodes relatives `current_month`, `current_quarter`, `current_year` et une plage absolue à minuits locaux sont prises en charge ; les comparaisons sont `previous_period` et `previous_year`. Le fuseau vient de `organizations.dataTimezone`. La requête utilise `[dt_jour] >= @periodFrom AND [dt_jour] < @periodTo`. L'Agent convertit les décimaux Sage à six décimales en chaînes à deux décimales uniquement si les décimales supplémentaires sont nulles ; une fraction de centime est rejetée. `COUNT_BIG(*)` distingue une somme nulle d'une absence de lignes.

La [référence Gate 1](../revenue-ht-reference.sql) interroge directement **`VW_FINANCE_GENERAL.ca_ht`**, avec les mêmes bornes et dimensions que la demande V2. Les résultats directs doivent encore être rapprochés de l'API V2 pour chaque scénario.

## Matrice actuelle

Les montants contrôlés proviennent exclusivement de `test/fixtures/data-engine-v2/revenue-ht-accounting.json` ; ils valident le pipeline et les bornes, pas la justesse Sage. Le test `test/revenue-ht-pilot.e2e-spec.ts` fixe l'horloge au 28/09/2026, fuseau `Africa/Dakar`.

| QueryRequest V2 (résumé) | SQL/paramètres déterminants | Référence fixture | V2 simulé | Écart | Technique | Sage |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `current_month` | `2026-09-01` → `2026-10-01`, somme de `ca_ht` | 300,00 | 300,00 | 0,00 | PASS | NON EXÉCUTÉ |
| `current_quarter` | `2026-07-01` → `2026-10-01` | 470,00 | 470,00 | 0,00 | PASS | NON EXÉCUTÉ |
| `current_year` | `2026-01-01` → `2027-01-01` | 470,00 | 470,00 | 0,00 | PASS | NON EXÉCUTÉ |
| `absolute` août | `2026-08-01` → `2026-09-01` | 50,00 | 50,00 | 0,00 | PASS | NON EXÉCUTÉ |
| `absolute` juin, écritures nettes zéro | `2026-06-01` → `2026-07-01` | 0,00 | 0,00, `success` | 0,00 | PASS | NON EXÉCUTÉ |
| `absolute` mai, sans ligne | `2026-05-01` → `2026-06-01` | aucune ligne | `empty` | — | PASS | NON EXÉCUTÉ |
| `current_year + month` | `GROUP BY [annee_mois]` | juin 0 ; juillet 120 ; août 50 ; septembre 300 | identique | 0,00 | PASS | NON EXÉCUTÉ |
| `current_month + previous_period` | courant septembre ; comparatif août | 300,00 / 50,00 | 300,00 / 50,00 | 0,00 | PASS | NON EXÉCUTÉ |
| `current_month + previous_year` | courant septembre 2026 ; comparatif septembre 2025 | 300,00 / 100,00 | 300,00 / 100,00 | 0,00 | PASS | NON EXÉCUTÉ |

Le harness teste également tenant différent, cache miss/hit, demandes concurrentes, erreur source et SQL public refusé. Les tests Agent contrôlent opt-in, paramètres liés, erreur et absence de repli V1. Le dispatcher teste agent absent, timeout, réponse tardive, déconnexion et provenance tenant/agent/séquence. **Aucun de ces tests ne remplace une exécution contre Sage.**

## Limites avant Gate 1

- Confirmer la devise, le fuseau et la validation métier de l'indicateur exposé par la vue et du traitement des avoirs.
- Exécuter la référence directe et V2 sur cette même base pour chaque ligne de la matrice, puis archiver montants et écarts exacts. Toute différence non expliquée est un FAIL.
- La vue joint `calendrier` en `LEFT JOIN` et peut perdre des dates hors calendrier. Vérifier couverture et cardinalité sur la base pilote.
- Le transport V2 garde les attentes de réponse en mémoire d'un processus backend. Multi-worker, reprise après redémarrage et annulation physique ne sont pas démontrés.
- Le cache cloud reste soumis aux validations opérationnelles et contractuelles d'ADR-005 avant persistance de données Sage. Le pilote est désactivé par défaut.
- `useKpiData`, les widgets V1 et les templates historiques restent inchangés.

## Contrôles Sage réels du 28 septembre 2026

Connexion locale à l'instance `SAGE100`, base `BIJOU`, authentification Windows ; requêtes `SELECT` uniquement. **Le compte Windows utilisé possède néanmoins `db_owner`** : les tests n'ont requis aucune écriture, mais ses droits ne constituent pas une garantie technique de lecture seule. Un principal SQL limité à `SELECT` est préférable pour l'E2E installé. La définition de la vue calcule `ca_ht` seulement pour les comptes `70*`. La comparaison suivante utilise les mêmes bornes `[dt_jour] >= début AND [dt_jour] < fin` dans les deux agrégats ; montants en devise de la base, non encore attestée par le métier.

| Période | Lignes de la vue | `SUM(ca_ht)` | Avec `cg_num LIKE '70%'` | Écart |
| --- | ---: | ---: | ---: | ---: |
| 2021-12 | 48 | 70 560,00 | 70 560,00 | 0,00 |
| 2022-01 | 62 | 4 186 862,37 | 4 186 862,37 | 0,00 |
| 2022-02 | 1 | 0,00 | 0,00 | 0,00 |
| 2022-12 | 8 | 10 000,00 | 10 000,00 | 0,00 |
| Année 2022 | 71 | 4 196 862,37 | 4 196 862,37 | 0,00 |
| Données disponibles | 119 | 4 267 422,37 | 4 267 422,37 | 0,00 |

Des exécutions **locales de l'exécuteur SQL V2 Agent**, hors WebSocket et hors backend, ont rendu : janvier 2022 `4 186 862,37` / 62 lignes ; février 2022 `0,00` / 1 ligne ; mars 2022 `NULL` / 0 ligne ; décembre 2021 `70 560,00` / 48 lignes ; groupement 2022 : janvier `4 186 862,37`, février `0,00`, décembre `10 000,00`. Les requêtes directes sur la même vue confirment ces agrégats et cardinalités. Cela prouve la compatibilité du SQL paramétré, du groupement et du décimal Sage sur ces cas ; cela ne prouve ni l'installation Agent ni le parcours E2E.

Build isolé : Agent `1.1.0`, cible `node18-win-x64`, `dist/gate1-test/cockpit-agent-service-v2.exe`, SHA-256 `89C8DCBC18BBBE9F33D6628E458D0931BA6EA6E718F12413BA812F047B30E6E6`. La compilation a terminé avec des avertissements `pkg` sur des fichiers non embarqués et du bytecode ; **l'exécutable empaqueté n'a pas été validé en service**. Le build `dist/service/cockpit-agent-service.exe` du 25 mai 2026 a été conservé comme retour arrière. Le service Windows `CockpitAgent` est arrêté. La configuration locale existante pointe vers `cockpit.nafakatech.com`, sans opt-in V2 ; aucun token d'organisation de test ni backend PostgreSQL joignable n'a été établi pour cette certification. L'Agent de test n'a donc pas été installé, activé ou connecté : les contrôles cache, fingerprint, déduplication, offline, timeout et tenant sur le parcours réel restent **NON EXÉCUTÉS**. Gate 1 : **BLOCKED**, aucun scénario E2E déclaré PASS.
