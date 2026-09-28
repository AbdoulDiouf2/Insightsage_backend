# Data Engine V2 — mapping et plan des phases 0 à 2

**Statut :** proposition documentaire à revoir après les cinq ADR. **Périmètre de cette livraison :** aucun code métier, endpoint, agent, frontend, schéma Prisma ou donnée modifié.

## Modèle cible et conventions

Les interfaces demandées sont définies dans [ADR-002](ADR-002-query-contract.md) (`MetricDefinition`, `DimensionDefinition`, `QueryRequest`, `AnalyticalFilters`, `SecurityScope` interne, `ConnectorId` interne, `PeriodDefinition`, `ComparisonDefinition`, `QueryPlan`, `QueryResult`, `QueryError`), [ADR-003](ADR-003-job-engine.md) (`JobState`) et [ADR-004](ADR-004-agent-security.md) (`AgentProtocolV2`). La séparation des politiques de cache et des timestamps est définie dans [ADR-005](ADR-005-cache-and-data-retention.md).

Le contrat de résultat doit conserver trois distinctions : ligne présente avec valeur `0`, jeu vide, erreur. Toute période et tout `AnalyticalFilters` demandés doivent apparaître dans le plan résolu et dans les paramètres exécutés ; sinon la requête échoue explicitement. Le `SecurityScope` est dérivé de l’identité et des permissions côté serveur puis imposé indépendamment des filtres. L’organisation est le seul contrôle RBAC vérifié aujourd’hui ; société, établissement et agence attendent un modèle de droits prouvé.

## Mapping existant → cible

| Existant | Classement V2 | Cible et justification | Compatibilité durant migration |
|---|---|---|---|
| `KpiDefinition` (`prisma/schema.prisma`) | **ADAPT** | Conserver clé/libellé/catalogue, relier explicitement une clé V2 à `MetricDefinition`, type, agrégation, dimensions, permissions et mapping source. `sqlSage100View` reste documentaire tant que non validé. | Lire les clés anciennes ; ne pas renommer ni supprimer les lignes avant mapping prouvé. |
| `WidgetTemplate` | **KEEP** | Garde la présentation (`vizType`, `subtype`, `defaultConfig`). La source de données passe dans un `QueryRequest` séparé. | Les templates et widgets V1 continuent à fonctionner. |
| `KpiPack` | **KEEP** | Garde l'organisation commerciale des indicateurs, avec mapping contrôlé des `kpiKeys` vers les métriques V2. Ne porte ni SQL ni droits suffisants à lui seul. | Les packs existants restent lus par `getStore`. |
| `NlqIntent` | **ADAPT** | Garde la classification du langage, mais la sortie cible devient une clé de métrique et des filtres structurés validés. | Le moteur NLQ V1 reste actif ; aucun SQL direct V2 depuis la classification. |
| `NlqTemplate` | **DEPRECATE** | Classifier `COMPATIBLE`/`ADAPTABLE`/`INCOMPATIBLE`/`BROKEN`/`PLACEHOLDER`. Un adaptateur peut créer un plan V2 seulement si la sémantique est prouvée ; sinon l'ancien chemin reste distinct. | Ni suppression ni modification massive des templates. |
| `AgentJob` | **REPLACE** pour V2 | Modèle V2 à états `PENDING`→`DISPATCHED`→`RUNNING`→terminal, ACK, empreinte, deadlines et transitions atomiques. | `AgentJob` V1 et son API restent disponibles, sans migration destructive. |
| `useKpiData` | **DEPRECATE** | `useQueryData` retourne état, résultat typé, erreur, fraîcheur, rafraîchissement et annulation. | Le hook actuel est conservé pour les widgets V1 jusqu'à leur migration. |
| `FilterContext` | **ADAPT** | Produit période et filtres structurés, avec portée globale/page/widget et précédence explicite. Les choix utilisateur deviennent des `AnalyticalFilters` ; le `scope` actuel ne devient jamais un champ du `QueryRequest` public ni une autorité de sécurité. Un filtre affiché n’est présenté comme actif que s’il est appliqué à la requête. | Les champs V1 restent disponibles tant que les widgets V1 les consomment. |

**Ancrages vérifiés :** `prisma/schema.prisma` (modèles), `src/widgets/widgets.service.ts` (`getStore`), `src/nlq/nlq.service.ts` (`processQuery`), `src/agents/agents.service.ts` (`executeRealTimeQuery`), `../Client-cockpit/src/hooks/use-kpi-data.ts`, `../Client-cockpit/src/context/FilterContext.tsx`.

## Ordre d'exécution et checkpoints

```text
ADR validées
  → Phase 0 : stabiliser V1, prouver les non-régressions
  → checkpoint 0
  → Phase 1 : créer le noyau V2 isolé et ses tests
  → checkpoint 1
  → Phase 2 : pilote CA HT, comparaison Sage et gate métier
  → checkpoint 2 avant tout autre KPI
```

Ce plan donne des **chemins de fichiers prévus**, sans les créer maintenant. Tous les chemins sont relatifs au dépôt indiqué. Pour les migrations Prisma, seul le préfixe horodaté est généré à l'exécution ; le nom `data_engine_v2` est fixé.

### Phase 0 — stabilisation du chemin actuel

**Avant modification.** Pas de migration Prisma prévue. Compatibilité des routes et payloads V1 maintenue. Risques : ancienne UI assimilant `0` à une valeur ; outils locaux utilisant `/execute_sql` ; effets sur la présence agent. Tests prévus : erreurs/vides/zéro, deux organisations sur un même navigateur, logout, résultat tardif, déconnexion, compteurs d'erreurs, accès distant au port local.

| Action | Chemins exacts prévus |
|---|---|
| Modifier backend | `insightsage_backend/src/agents/agents.service.ts`; `insightsage_backend/src/agents/agents.gateway.ts`; `insightsage_backend/src/agents/agent-v1.controller.ts` seulement si la télémétrie V1 doit être étendue ; `insightsage_backend/src/agents/dto/heartbeat-v1.dto.ts` dans le même cas. |
| Modifier agent Node | `cockpit-agent/service/src/utils/health.js`; `cockpit-agent/service/src/scheduler.js`; `cockpit-agent/service/src/sync/uploader.js`; `cockpit-agent/service/src/ws/agent-socket.js` seulement pour la télémétrie et la corrélation V1. |
| Modifier frontend | `Client-cockpit/src/hooks/use-kpi-data.ts`; `Client-cockpit/src/lib/cache.ts`; `Client-cockpit/src/features/auth/AuthContext.tsx`; `Client-cockpit/src/features/settings/AgentTab.tsx`; `Client-cockpit/src/context/FilterContext.tsx` seulement si un filtre affiché doit être neutralisé ou correctement appliqué. |
| Créer tests backend | `insightsage_backend/src/agents/agents.service.phase0.spec.ts`; `insightsage_backend/src/agents/agents.gateway.phase0.spec.ts`. |
| Créer tests agent | `cockpit-agent/service/test/health-security.test.js`; `cockpit-agent/service/test/sql-security.test.js`. |
| Créer tests frontend | `Client-cockpit/src/hooks/__tests__/use-kpi-data.test.tsx`; `Client-cockpit/src/lib/__tests__/cache-isolation.test.ts`; `Client-cockpit/src/features/settings/__tests__/AgentTab.test.tsx`. |
| Créer documentation | `insightsage_backend/docs/data-engine/legacy-data-retention.md`; `insightsage_backend/docs/data-engine/phase-0-validation.md`. |
| Déprécier | Aucun fichier supprimé. Les commentaires et messages produit « Zero-Copy » inexacts doivent être marqués obsolètes puis corrigés après validation du texte. Le compteur `errorCount` comme synonyme d'absence d'erreur est abandonné dans l'affichage. |

**Checkpoint 0 :** V1 conserve les réponses valides ; erreur/absence/zéro sont discernables, cache et logout isolés, `POST /execute_sql` inaccessible sans contrôle approprié, état terminal d'un job non écrasable, diagnostic agent cohérent. Compte rendu après modification : liste des fichiers effectivement changés, commandes de test et résultats, effets de compatibilité, dette restante.

### Phase 1 — noyau V2 sans bascule des widgets

**Avant modification.** Migration additive Prisma nécessaire pour `DataJobV2` et, pour la stratégie B de cache cloud contrôlé retenue provisoirement, ses métadonnées/résultats chiffrés. Aucun changement des tables V1. Risques : validations opérationnelles et contractuelles de B incomplètes, mauvais mapping de colonnes Sage, nouvelle API trop permissive. Tests prévus : validation DTO, périodes en fuseau, `SecurityScope` issu du serveur, `AnalyticalFilters` bornés par ce périmètre, dimensions, comparaisons, paramètres SQL, empreinte incluant les deux composantes, transitions concurrentes, tenant, cache et fixtures contractuelles.

| Action | Chemins exacts prévus |
|---|---|
| Créer contrat | `insightsage_backend/src/data-engine/contracts/query-request.ts`; `query-result.ts`; `query-error.ts`; `query-plan.ts`; `security-scope.ts`; `semantic-definition.ts` (tous dans `src/data-engine/contracts/`). |
| Créer registre/planification | `insightsage_backend/src/data-engine/semantic/semantic-registry.service.ts`; `insightsage_backend/src/data-engine/planner/query-validator.service.ts`; `security-scope.service.ts`; `period-resolver.service.ts`; `query-planner.service.ts`; `sql-compiler.service.ts` (les cinq derniers dans `src/data-engine/planner/`). |
| Créer exécution | `insightsage_backend/src/data-engine/jobs/data-job-v2.service.ts`; `data-job-v2.state.ts`; `data-job-v2.dispatcher.ts`; `insightsage_backend/src/data-engine/cache/query-cache.service.ts`; `insightsage_backend/src/data-engine/data.controller.ts`; `insightsage_backend/src/data-engine/data.service.ts`; `insightsage_backend/src/data-engine/data-engine.module.ts`. |
| Créer adaptateur historique et rapport | `insightsage_backend/src/data-engine/legacy/legacy-query.adapter.ts`; `insightsage_backend/scripts/audit-kpi-catalog.ts`; `insightsage_backend/docs/data-engine/catalog-audit.json`; `insightsage_backend/docs/data-engine/catalog-audit.md`. Les deux rapports sont produits par le script, jamais pris pour des données de production. |
| Créer tests/fixtures | `insightsage_backend/src/data-engine/planner/query-validator.service.spec.ts`; `period-resolver.service.spec.ts`; `query-planner.service.spec.ts`; `sql-compiler.service.spec.ts`; `insightsage_backend/src/data-engine/jobs/data-job-v2.service.spec.ts`; `insightsage_backend/src/data-engine/cache/query-cache.service.spec.ts`; `insightsage_backend/test/fixtures/data-engine-v2/revenue-ht-quarter-dakar.json`; `insightsage_backend/test/data-engine.contract.e2e-spec.ts`. |
| Modifier | `insightsage_backend/prisma/schema.prisma`; `insightsage_backend/src/app.module.ts`; `insightsage_backend/src/agents/agents.gateway.ts` pour événements V2 séparés ; `insightsage_backend/src/agents/agents.module.ts` pour les dépendances. |
| Migration générée | `insightsage_backend/prisma/migrations/<timestamp>_data_engine_v2/migration.sql` ; le timestamp exact dépend de la date de génération et doit être figé dans le compte rendu de Phase 1. |
| Déprécier | Aucun fichier V1 supprimé ; `NlqTemplate` et `AgentJob` restent la voie historique, sans être sources de vérité V2. |

**Checkpoint 1 :** module V2 et API testés avec connecteur simulé ; aucune requête source lancée pour un filtre non pris en charge ; aucun widget V1 changé ; migration additive vérifiée sur base de test ; conditions opérationnelles et contractuelles de B approuvées avant toute persistance de lignes V2 ; aucune demande ou réponse agent ne peut élargir le `SecurityScope`.

### Phase 2 — pilote `revenue_ht`

**Avant modification.** Aucune modification massive des vues Sage. Une migration additive est nécessaire uniquement si la version/capacité agent doit être persistée ; l'option préférée est d'abord une annonce de capacité au handshake, vérifiée par tests. Risques : différence entre CA comptable et CA facturé, dates/fuseau, droits d'accès, certificat SQL, agent V1 incapable d'exécuter les paramètres V2. Tests prévus : mois/trimestre/année/plage absolue, `group by month`, comparaisons période et N-1, source SQL Sage de référence, agent mock puis agent pilote, résultat tardif et tenant.

| Action | Chemins exacts prévus |
|---|---|
| Créer pilote sémantique | `insightsage_backend/src/data-engine/semantic/metrics/revenue-ht.metric.ts`; `insightsage_backend/src/data-engine/semantic/dimensions/sage100-finance.dimensions.ts`; `insightsage_backend/src/data-engine/connectors/sage100/sage100.connector.ts`; `insightsage_backend/src/data-engine/connectors/sage100/sage100-finance.resources.ts`. |
| Créer protocole agent V2 | `cockpit-agent/service/src/ws/query-protocol-v2.js`; `cockpit-agent/service/src/jobs/query-executor-v2.js`; `cockpit-agent/service/test/query-protocol-v2.test.js`; `cockpit-agent/service/test/query-executor-v2.test.js`. |
| Modifier agent/backend | `cockpit-agent/service/src/ws/agent-socket.js`; `cockpit-agent/service/src/sql/connection.js`; `insightsage_backend/src/agents/agents.gateway.ts`; `insightsage_backend/src/data-engine/jobs/data-job-v2.dispatcher.ts`; `insightsage_backend/src/data-engine/semantic/semantic-registry.service.ts`. |
| Créer tests pilotes | `insightsage_backend/src/data-engine/semantic/metrics/revenue-ht.metric.spec.ts`; `insightsage_backend/test/fixtures/data-engine-v2/revenue-ht-month.json`; `revenue-ht-year.json`; `revenue-ht-custom.json`; `revenue-ht-previous-period.json`; `revenue-ht-previous-year.json` (dans le même dossier de fixtures) ; `insightsage_backend/test/revenue-ht-agent.e2e-spec.ts`. |
| Créer référence/mesures | `insightsage_backend/docs/data-engine/revenue-ht-reference.sql`; `insightsage_backend/docs/data-engine/revenue-ht-pilot-results.md`. La requête de référence doit préciser si le CA vient des écritures comptables ou des factures ; aucun rapprochement implicite. |
| Modifier/frontend | Aucun widget existant. Un client pilote peut appeler `POST /api/data/query` en test, sans changer `useKpiData` ni la navigation. |
| Déprécier | Aucun fichier supprimé. L'ancien template `f01_ca_ht` reste actif pour les anciens widgets jusqu'à validation du pilote. |

**Checkpoint 2 / Gate 1 :** résultats CA HT concordants avec la requête Sage de référence pour chaque période et comparaison, isolation tenant et bornage des `AnalyticalFilters` par le `SecurityScope` démontrés, aucune erreur masquée, jobs déterministes, tests contractuels et agent V1/V2 passés. En cas d'échec, arrêter la migration et conserver le pipeline V1. Le passage à d'autres KPI, aux widgets ou à Zuri exige un nouveau checkpoint.

## Règle de compte rendu à chaque phase

Avant chaque modification : fichiers concernés, migration, compatibilité, risques et tests prévus. Après : fichiers réellement modifiés, tests et résultats, régressions et dette restante. La présente liste est un plan ; elle ne prouve pas que les fichiers futurs existent déjà.
