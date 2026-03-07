# Module Targets — Objectifs KPI (Cockpit)

Ce module permet aux organisations de déclarer leurs **objectifs KPI** par période et scénario budgétaire. Il alimente la comparaison **réel vs objectif** sur le dashboard.

## Concept

Un objectif lie un **KPI** (`kpiKey` → `KpiDefinition`), une **période** (trimestre, semestre, etc.), une **année** et un **scénario budgétaire** (budget initial, révisé, forecast, stretch). La combinaison `org + kpi + période + scénario` est unique : créer un objectif existant le remplace (upsert).

## Types de période — `PeriodType`

| Valeur | Périodes/an | `periodIndex` | Exemple |
|--------|-------------|---------------|---------|
| `MENSUEL` | 12 | 1–12 | Janvier = 1, Décembre = 12 |
| `BIMESTRE` | 6 | 1–6 | Jan-Fév = 1, Nov-Déc = 6 |
| `TRIMESTRE` | 4 | 1–4 | Q1 = 1, Q4 = 4 |
| `SEMESTRE` | 2 | 1–2 | S1 = 1, S2 = 2 |
| `ANNEE` | 1 | 1 | Toujours 1 |

## Types de valeur — `TargetValueType`

| Valeur | Description | Exemple |
|--------|-------------|---------|
| `ABSOLUTE` | Valeur brute dans l'unité native du KPI | 150 000 FCFA, 30 jours |
| `PERCENTAGE` | Pourcentage absolu | 45 % de marge brute |
| `DELTA_PERCENT` | Variation relative vs référence (requiert `deltaReference`) | +8 % de croissance YoY |

## Référence du delta — `DeltaReference`

Utilisé uniquement si `valueType = DELTA_PERCENT`.

| Valeur | Comparaison |
|--------|-------------|
| `PREVIOUS_PERIOD` | vs période précédente (Q2 vs Q1) |
| `SAME_PERIOD_LAST_YEAR` | vs même période N-1 (Q1 2025 vs Q1 2024) |

## Scénarios — `TargetScenario`

| Valeur | Usage |
|--------|-------|
| `BUDGET` | Budget initial voté (référence principale) |
| `REVISED` | Budget révisé formellement (mi-année) |
| `FORECAST` | Prévision glissante mise à jour en temps réel |
| `STRETCH` | Objectif ambitieux "best case" |

## Direction KPI — `KpiDefinition.direction`

Champ ajouté sur `KpiDefinition` pour que le dashboard sache colorier les écarts :
- `HIGHER_IS_BETTER` : vert si réel > objectif (CA, marge, EBITDA)
- `LOWER_IS_BETTER` : vert si réel < objectif (DMP, AR Aging, coûts)

## Routes API

| Méthode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/targets` | Liste avec filtres `kpiKey`, `year`, `periodType`, `scenario` | `read:targets` |
| `GET` | `/targets/:id` | Détail d'un objectif | `read:targets` |
| `POST` | `/targets` | Créer ou remplacer (upsert) | `manage:targets` |
| `PATCH` | `/targets/:id` | Modifier `value`, `valueType`, `deltaReference`, `year`, `label` | `manage:targets` |
| `DELETE` | `/targets/:id` | Supprimer | `manage:targets` |

## RBAC

| Rôle | Permissions |
|------|-------------|
| `superadmin` | `manage:all` (bypass) |
| `owner` / `daf` | `read:targets` + `manage:targets` |
| `controller` | `read:targets` + `manage:targets` |
| `analyst` | `read:targets` uniquement |

## Structure

```
src/targets/
  targets.module.ts
  targets.controller.ts
  targets.service.ts
  dto/
    create-target.dto.ts
    update-target.dto.ts
```

## API publique

```typescript
findAll(organizationId, filters): Promise<Target[]>
findOne(id, organizationId): Promise<Target>
create(organizationId, dto, userId?): Promise<Target>
update(id, organizationId, dto, userId?): Promise<Target>
remove(id, organizationId, userId?): Promise<{ message: string }>
```
