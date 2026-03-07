---
title: Objectifs KPI (Targets)
description: Module de gestion des objectifs KPI par période et scénario budgétaire — Cockpit API
---

# Module Targets — Objectifs KPI

Le module `TargetsModule` permet aux organisations de déclarer leurs **objectifs KPI** par période (mensuelle, trimestrielle, semestrielle, annuelle…) et par scénario budgétaire (budget initial, révisé, forecast, stretch). Il alimente la comparaison **réel vs objectif** sur le dashboard client.

---

## Architecture

```
src/targets/
  targets.module.ts
  targets.controller.ts     ← 5 endpoints RBAC
  targets.service.ts        ← CRUD + validation + upsert + audit log
  dto/
    create-target.dto.ts
    update-target.dto.ts
```

---

## Modèle de données

### Enums

=== "PeriodType"
    | Valeur | Périodes/an | `periodIndex` |
    |--------|-------------|---------------|
    | `MENSUEL` | 12 | 1–12 |
    | `BIMESTRE` | 6 | 1–6 |
    | `TRIMESTRE` | 4 | 1–4 |
    | `SEMESTRE` | 2 | 1–2 |
    | `ANNEE` | 1 | 1 |

=== "TargetValueType"
    | Valeur | Description | Exemple |
    |--------|-------------|---------|
    | `ABSOLUTE` | Valeur brute dans l'unité du KPI | 150 000 FCFA, 30 jours |
    | `PERCENTAGE` | Pourcentage absolu | 45 % de marge |
    | `DELTA_PERCENT` | Variation % vs référence | +8 % YoY |

=== "DeltaReference"
    | Valeur | Comparaison |
    |--------|-------------|
    | `PREVIOUS_PERIOD` | vs période précédente |
    | `SAME_PERIOD_LAST_YEAR` | vs même période N-1 (YoY) |

=== "TargetScenario"
    | Valeur | Usage |
    |--------|-------|
    | `BUDGET` | Budget initial voté |
    | `REVISED` | Budget révisé formellement |
    | `FORECAST` | Prévision glissante |
    | `STRETCH` | Objectif ambitieux |

### Modèle `Target`

```prisma
model Target {
  id             String          @id @default(uuid())
  kpiKey         String          // → KpiDefinition.key
  value          Float
  valueType      TargetValueType @default(ABSOLUTE)
  deltaReference DeltaReference? // null sauf si DELTA_PERCENT
  periodType     PeriodType
  periodIndex    Int
  year           Int
  scenario       TargetScenario  @default(BUDGET)
  label          String?
  organizationId String
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  // 1 seul objectif par org + kpi + période + scénario
  @@unique([organizationId, kpiKey, periodType, periodIndex, year, scenario])
}
```

### Champ `direction` sur `KpiDefinition`

```prisma
direction String @default("HIGHER_IS_BETTER")
// "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"
```

Permet au frontend de colorier les écarts réel vs objectif :

- **`HIGHER_IS_BETTER`** : vert si réel ≥ objectif (CA, marge, EBITDA)
- **`LOWER_IS_BETTER`** : vert si réel ≤ objectif (DMP, AR Aging, coûts)

---

## Endpoints

| Méthode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/targets` | Liste les objectifs (filtres: `kpiKey`, `year`, `periodType`, `scenario`) | `read:targets` |
| `GET` | `/targets/:id` | Détail d'un objectif + KPI enrichi | `read:targets` |
| `POST` | `/targets` | Créer ou remplacer un objectif (upsert) | `manage:targets` |
| `PATCH` | `/targets/:id` | Modifier valeur, type, référence delta, année ou label | `manage:targets` |
| `DELETE` | `/targets/:id` | Supprimer un objectif | `manage:targets` |

### `POST /targets` — Payload

```json
{
  "kpiKey": "ca_ht",
  "value": 150000,
  "valueType": "ABSOLUTE",
  "periodType": "TRIMESTRE",
  "periodIndex": 1,
  "year": 2025,
  "scenario": "BUDGET",
  "label": "Objectif CA Q1 2025"
}
```

!!! info "Upsert automatique"
    Si un objectif existe déjà pour la combinaison `org + kpi + période + scénario`, il est **remplacé** plutôt que dupliqué. Aucun doublon ne peut exister.

### `POST /targets` — Objectif de croissance (DELTA_PERCENT)

```json
{
  "kpiKey": "ca_ht",
  "value": 8,
  "valueType": "DELTA_PERCENT",
  "deltaReference": "SAME_PERIOD_LAST_YEAR",
  "periodType": "TRIMESTRE",
  "periodIndex": 1,
  "year": 2025,
  "scenario": "BUDGET",
  "label": "+8% CA Q1 2025 vs Q1 2024"
}
```

!!! warning "deltaReference obligatoire"
    Si `valueType = DELTA_PERCENT`, le champ `deltaReference` est **obligatoire**. L'API retourne `400` sinon.

### Exemple de réponse enrichie

```json
{
  "id": "uuid",
  "kpiKey": "ca_ht",
  "value": 150000,
  "valueType": "ABSOLUTE",
  "deltaReference": null,
  "periodType": "TRIMESTRE",
  "periodIndex": 1,
  "year": 2025,
  "scenario": "BUDGET",
  "label": "Objectif CA Q1 2025",
  "organizationId": "uuid",
  "kpiDefinition": {
    "key": "ca_ht",
    "name": "Chiffre d'Affaires (CA) HT",
    "unit": "FCFA",
    "category": "finance",
    "direction": "HIGHER_IS_BETTER"
  },
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

---

## RBAC

| Rôle | `read:targets` | `manage:targets` |
|------|:--------------:|:----------------:|
| `superadmin` | bypass (`manage:all`) | bypass |
| `owner` | ✓ | ✓ |
| `daf` | ✓ | ✓ |
| `controller` | ✓ | ✓ |
| `analyst` | ✓ | — |

---

## Validations

| Règle | Comportement |
|-------|-------------|
| `kpiKey` inconnu | `400 Bad Request` |
| `periodIndex` hors plage (ex: 5 pour TRIMESTRE) | `400 Bad Request` |
| `valueType = DELTA_PERCENT` sans `deltaReference` | `400 Bad Request` |
| Objectif d'une autre organisation | `403 Forbidden` |
| Objectif introuvable | `404 Not Found` |

---

## Audit log

Chaque opération génère un événement dans `audit_logs` :

| Action | Event |
|--------|-------|
| Création | `target_created` |
| Modification | `target_updated` |
| Suppression | `target_deleted` |
