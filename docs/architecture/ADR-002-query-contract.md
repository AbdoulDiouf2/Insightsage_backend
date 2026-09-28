# ADR-002 — Contrat de requête V2 et modèle sémantique

**Statut :** proposé, en attente de validation. Les interfaces ci-dessous constituent le **modèle cible à confirmer** avant de créer du code métier.

## Problème et architecture actuelle

`useKpiData` envoie une phrase comme `f01_ca_ht pour current_quarter en XOF`. `NlqService.processQuery` classe l'intention et exécute `NlqTemplate.sqlQuery` sans traduire génériquement la période, la devise ni les filtres. `ChartVisual` infère des axes depuis les noms de colonnes. `FilterContext.scope` n'est pas consommé par ce trajet. Aucun contrat existant ne prouve qu'un filtre affiché modifie la requête source.

## Décision proposée

Une demande décrit la **mesure** et ses **contraintes métier**, jamais du SQL. Le backend vérifie le registre, les permissions, les combinaisons et les valeurs, puis produit un plan immuable. Les identifiants de métriques, dimensions, ressources, colonnes et ordres de tri viennent exclusivement d'allowlists serveur. Seules les valeurs passent en paramètres SQL. Une capacité non supportée entraîne `QUERY_INVALID` ou `NOT_CONFIGURED`, sans omission silencieuse.

Les périodes sont résolues dans le fuseau défini pour l'organisation et deviennent des intervalles **[début inclus, fin exclue)**. Le `to` d'une période absolue est exclusif. Une comparaison `previous_year` utilise les mêmes bornes calendrier décalées d'un an, avec règle explicite pour le 29 février ; `previous_period` utilise l'intervalle de même durée immédiatement précédent. `budget` et `target` exigent une source configurée. Une devise différente de la devise source exige un taux et une date de conversion traçables, sinon la demande échoue. Ces règles doivent être éprouvées par fixtures avant leur activation.

## Interfaces TypeScript cibles

Ces signatures sont **normatives pour l'ADR**, mais ne sont pas encore des fichiers `.ts` exécutables. `IsoDateTime` signifie une chaîne ISO 8601 avec fuseau ; les DTO runtime vérifieront réellement ce format.

```ts
type IsoDateTime = string;
type ValueType = 'string' | 'date' | 'number' | 'boolean';
type MeasureType = 'currency' | 'number' | 'percentage' | 'duration';
type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count';
type ComparisonType = 'previous_period' | 'previous_year' | 'budget' | 'target';
type FilterOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'contains';

type ConnectorId = string; // interne et extensible ; seul sage100 est défini pour le pilote

interface SourceMetricMapping {
  connector: ConnectorId;
  resource: string;           // clé de ressource autorisée, jamais du SQL client
  measureExpressionId: string; // clé d'expression revue côté serveur
  dateDimension?: string;
  sourceCurrency?: string;
  sourceTimezone?: string;
}

interface SourceDimensionMapping {
  connector: ConnectorId;
  resource: string;
  expressionId: string;       // clé d'expression/colonne autorisée côté serveur
}

interface MetricDefinition {
  key: string;
  label: string;
  description?: string;
  dataType: MeasureType;
  defaultAggregation: Aggregation;
  allowedDimensions: string[];
  allowedFilters: string[];
  supportedComparisons: ComparisonType[];
  supportedVisualizations: string[];
  sourceMapping: SourceMetricMapping;
  defaultCacheTtlSeconds: number;
  nullPolicy: 'preserve' | 'zero_if_empty_set';
  requiredPermission: { action: string; resource: string };
}

interface DimensionDefinition {
  key: string;
  label: string;
  dataType: ValueType;
  sourceMapping: SourceDimensionMapping;
  allowedOperators: FilterOperator[];
  nullable: boolean;
}

interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | null | Array<string | number | boolean>;
}

type AnalyticalFilters = QueryFilter[]; // filtres demandés, jamais source d’autorisation

type PeriodDefinition =
  | { type: 'relative'; value: 'today' | 'current_week' | 'current_month' |
      'current_quarter' | 'current_year' | 'previous_month' |
      'previous_quarter' | 'previous_year' }
  | { type: 'absolute'; from: IsoDateTime; to: IsoDateTime }; // to exclusif

interface ComparisonDefinition { type: ComparisonType }
interface SortDefinition { field: string; direction: 'asc' | 'desc' }
interface QueryContext {
  requestId?: string;        // corrélation seulement ; jamais identité/permission
  dashboardId?: string;
  widgetId?: string;
  source?: 'dashboard' | 'exploration' | 'export' | 'zuri';
}

interface QueryRequest {
  version: '2';
  metric: string;
  dimensions?: string[];
  filters?: AnalyticalFilters;
  period?: PeriodDefinition;
  comparison?: ComparisonDefinition;
  currency?: string;
  sort?: SortDefinition[];
  limit?: number;
  context?: QueryContext;
}

interface ResolvedDimension {
  key: string;
  expressionId: string;
  dataType: ValueType;
}
interface ResolvedFilter {
  field: string;
  expressionId: string;
  operator: FilterOperator;
  parameterNames: string[];
}
interface ResolvedPeriod {
  dateDimension: string;
  fromInclusive: IsoDateTime;
  toExclusive: IsoDateTime;
  timezone: string;
}
interface ResolvedComparison {
  type: ComparisonType;
  fromInclusive?: IsoDateTime;
  toExclusive?: IsoDateTime;
  sourceKey?: string;          // budget ou cible explicitement configuré
}
type SqlParameter = string | number | boolean | null | IsoDateTime;

interface SecurityScope {
  organizationId: string; // issu de l’identité authentifiée côté serveur
  // Contraintes futures seulement après validation du RBAC correspondant.
  constraints?: ReadonlyArray<{ field: string; allowedValues: readonly string[] }>;
}

interface QueryPlan {
  version: '2';
  queryId: string;
  requestId: string;
  securityScope: SecurityScope; // interne, jamais fourni par QueryRequest
  metric: MetricDefinition;
  dimensions: ResolvedDimension[];
  analyticalFilters: ResolvedFilter[];
  period?: ResolvedPeriod;
  comparison?: ResolvedComparison;
  source: { connector: ConnectorId; resource: string; schemaVersion: string };
  execution: { statement: string; parameters: Record<string, SqlParameter> };
  limits: { maxRows: number; timeoutMs: number };
  queryFingerprint: string;
}

interface QueryResultField {
  key: string;
  type: MeasureType | ValueType;
  nullable: boolean;
  unit?: string;
  role: 'metric' | 'dimension' | 'comparison';
}
interface QueryResult {
  queryId: string;
  status: 'success' | 'empty';
  schema: QueryResultField[];
  rows: Record<string, unknown>[];
  meta: {
    rowCount: number;
    generatedAt: IsoDateTime;
    queryExecutedAt: IsoDateTime;
    sourceFreshness?: IsoDateTime;
    cachedAt?: IsoDateTime;
    executionTimeMs?: number;
    cache: 'none' | 'browser' | 'backend';
    truncated: boolean;
  };
}

type QueryErrorCode = 'AGENT_OFFLINE' | 'QUERY_INVALID' | 'QUERY_TIMEOUT' |
  'SOURCE_UNAVAILABLE' | 'SOURCE_SCHEMA_MISMATCH' | 'PERMISSION_DENIED' |
  'RATE_LIMITED' | 'RESULT_TOO_LARGE' | 'NOT_CONFIGURED' | 'INTERNAL_ERROR';
interface QueryError {
  queryId?: string;
  requestId: string;
  code: QueryErrorCode;
  message: string;             // message utilisateur expurgé
  retryable: boolean;
  details?: Record<string, string>; // champs publics seulement
}
```

`JobState` et `AgentProtocolV2` sont fixés dans ADR-003 et ADR-004 pour éviter des définitions divergentes.

Le `QueryRequest` public ne contient ni connecteur ni périmètre d’autorisation. Le registre résout le `ConnectorId` dans les mappings internes ; `sage100` est le seul connecteur configuré pour le pilote.

## Validation et résultat

Une valeur `0` est une valeur de succès seulement si SQL et la règle de la métrique le justifient. Zéro ligne donne `status: 'empty'` et `rows: []`. Un agrégat SQL `NULL` conserve `null` sauf politique métier explicite. Les erreurs prennent `QueryError`, jamais `QueryResult`. Le `queryId` lie demande, plan, job et résultat. `requestId` relie l'appel HTTP aux journaux. La fraîcheur Sage ne peut être déclarée que si une source la fournit.

La fusion des filtres V2 se fait par champ selon l'ordre global → page → widget ; une valeur plus locale remplace celle du même champ, puis le backend valide le jeu final. Les autres champs restent cumulés. Le `SecurityScope` est dérivé côté serveur de l’identité authentifiée et des permissions, puis les `AnalyticalFilters` sont appliqués à l’intérieur de ce périmètre. L’organisation est le contrôle RBAC actuel. Société, établissement et agence peuvent être des filtres analytiques, mais ne sont pas des périmètres de sécurité implémentés ; elles exigent un modèle de droits vérifié. Aucun filtre public ne peut élargir le `SecurityScope`. Le catalogue déclare explicitement les combinaisons disponibles ; aucun axe n'est deviné d'un nom SQL.

## Alternatives étudiées, compromis et migration

**Avantages :** dimensions et filtres vérifiables, SQL paramétré, résultat typé et mêmes données pour plusieurs présentations. **Inconvénients :** mappings sémantiques à maintenir, combinaisons impossibles à refuser explicitement, comparaison et devise à valider sur les sources réelles.

| Option | Analyse |
|---|---|
| Conserver le SQL dans chaque widget | Rejetée : mélange données et présentation, filtres non vérifiables. |
| Traduire librement les phrases NLQ en SQL | Rejetée : plan non déterministe et risque d'exécution arbitraire. |
| Contrat structuré avec registre | Retenu : vérification et fixtures possibles ; coût de définition des mappings. |

La migration crée d'abord le contrat et son validateur sans changer les clients. Le pilote `revenue_ht` utilise une ressource et une date effectivement vérifiées sur Sage. Les anciennes clés `f01_ca_ht` et les templates demeurent pendant la coexistence ; leur équivalence avec `revenue_ht` doit être prouvée, pas présumée.

## Compatibilité

Les clients V1 gardent leurs routes, leur forme de réponse et leurs clés KPI jusqu'à une migration séparée. Un `QueryRequest` V2 n'est accepté que sur l'API V2 ; il ne peut pas être interprété comme une phrase NLQ V1. Un registre sans mapping validé renvoie une erreur explicite.

**Fichiers sources :** `src/nlq/nlq.service.ts` (`processQuery`), `src/widgets/widgets.service.ts` (`getStore`), `prisma/schema.prisma` (`KpiDefinition`, `NlqTemplate`), `../Client-cockpit/src/hooks/use-kpi-data.ts` (`useKpiData`), `../Client-cockpit/src/context/FilterContext.tsx` (`FilterProvider`), `../Client-cockpit/src/features/dashboard/components/visuals/ChartVisual.tsx` (`ChartVisual`).
