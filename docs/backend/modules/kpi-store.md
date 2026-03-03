---
title: Module KPI Store
description: Gestion des KPI Definitions, Widget Templates et KPI Packs
---

# Module KPI Store

Le module KPI Store centralise les métadonnées nécessaires au cockpit CFO/DAF :
- **KPI Definitions** : définition des indicateurs clés de performance
- **Widget Templates** : templates de visualisation disponibles
- **KPI Packs** : regroupements de KPIs par profil métier

Les données sont exposées côté **client** (filtré par plan) via `GET /widget-store` et côté **admin** via les endpoints `/admin/kpi-*`.

---

## Modèles Prisma

### KpiDefinition (`kpi_definitions`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `key` | String (unique) | Clé machine : `revenue_mom`, `dmp`, `ar_aging`, `gross_margin`, `ebitda` |
| `name` | String | Nom affiché : "CA Mois/Mois" |
| `description` | String? | Description optionnelle |
| `unit` | String? | Unité : `€`, `%`, `jours` |
| `category` | String | Catégorie : `finance` \| `commercial` \| `treasury` |
| `defaultVizType` | String | Visualisation par défaut : `gauge` \| `bar` \| `card` \| `line` \| `table` |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

### WidgetTemplate (`widget_templates`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String | Nom affiché : "Carte KPI" |
| `vizType` | String (unique) | Type de viz : `card` \| `bar` \| `line` \| `gauge` \| `table` |
| `description` | String? | Description |
| `defaultConfig` | Json | Config JSON par défaut : `{ "period": "month" }` |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

### KpiPack (`kpi_packs`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String (unique) | Identifiant : `pack_daf`, `pack_dg`, `pack_controller` |
| `label` | String | Nom affiché : "Pack DAF" |
| `profile` | String | Profil métier : `daf` \| `dg` \| `controller` \| `manager` \| `analyst` |
| `kpiKeys` | String[] | Clés KPI incluses |
| `description` | String? | Description du pack |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

---

## Données seedées

### 5 KPI Definitions (DAF)

| Clé | Nom | Catégorie | Unité | Viz par défaut |
|-----|-----|-----------|-------|----------------|
| `revenue_mom` | CA Mois/Mois | finance | % | gauge |
| `dmp` | Délai Moyen de Paiement | treasury | jours | card |
| `ar_aging` | Encours Clients | treasury | € | bar |
| `gross_margin` | Marge Brute | finance | % | gauge |
| `ebitda` | EBITDA | finance | € | card |

### 5 Widget Templates

| vizType | Nom | defaultConfig |
|---------|-----|---------------|
| `card` | Carte KPI | `{ "period": "month" }` |
| `bar` | Graphique Barres | `{ "period": "month", "aggregation": "sum" }` |
| `line` | Courbe Temporelle | `{ "period": "year", "granularity": "month" }` |
| `gauge` | Jauge | `{ "target": 100, "unit": "%" }` |
| `table` | Tableau | `{ "limit": 20 }` |

### 3 KPI Packs

| Nom | Profil | KPIs inclus |
|-----|--------|-------------|
| `pack_daf` | daf | Tous les 5 KPIs |
| `pack_dg` | dg | revenue_mom, gross_margin, ebitda |
| `pack_controller` | controller | dmp, ar_aging, gross_margin |

---

## Endpoints Admin — `/admin/kpi-*`

!!! warning "Permissions"
    Tous ces endpoints requièrent `manage:all` (rôle `superadmin`).

### KPI Definitions

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/admin/kpi-definitions` | Lister toutes (actives + inactives) |
| `POST` | `/admin/kpi-definitions` | Créer une nouvelle KPI Definition |
| `PATCH` | `/admin/kpi-definitions/:id` | Modifier (partiel) |
| `DELETE` | `/admin/kpi-definitions/:id` | Toggle `isActive` (soft delete/reactivate) |

### Widget Templates

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/admin/widget-templates` | Lister tous |
| `POST` | `/admin/widget-templates` | Créer |
| `PATCH` | `/admin/widget-templates/:id` | Modifier |
| `DELETE` | `/admin/widget-templates/:id` | Toggle `isActive` |

### KPI Packs

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/admin/kpi-packs` | Lister tous |
| `POST` | `/admin/kpi-packs` | Créer |
| `PATCH` | `/admin/kpi-packs/:id` | Modifier (label, profile, kpiKeys) |
| `DELETE` | `/admin/kpi-packs/:id` | Toggle `isActive` |

---

## Endpoint Client — Widget Store

### GET `/widget-store`

**Accès :** Utilisateur authentifié avec permission `read:widgets`

**Query params :**
- `profile` (optionnel) : filtrer par profil métier (`daf`, `dg`, etc.)

**Logique :**
1. Récupère les `allowedKpiPacks` du plan d'abonnement de l'organisation
2. Filtre les `KpiPacks` en fonction de ces packs autorisés
3. Enrichit chaque pack avec les détails des `KpiDefinition`
4. Retourne également tous les `WidgetTemplate` actifs

**Réponse 200 :**
```json
{
  "kpiPacks": [
    {
      "id": "uuid",
      "name": "pack_daf",
      "label": "Pack DAF",
      "profile": "daf",
      "kpiKeys": ["revenue_mom", "dmp"],
      "kpis": [
        { "key": "revenue_mom", "name": "CA Mois/Mois", "unit": "%", ... }
      ]
    }
  ],
  "kpiDefinitions": [...],
  "widgetTemplates": [...]
}
```

---

## Comportement du soft delete

!!! info "Toggle isActive"
    Le `DELETE /:id` ne supprime pas l'enregistrement — il bascule `isActive` entre `true` et `false`.

    - Premier appel : `isActive` → `false` (désactivé)
    - Deuxième appel : `isActive` → `true` (réactivé)

    Cette approche préserve les données et les références existantes (ex: un `KpiPack` référençant une `KpiDefinition` désactivée reste valide).

---

## Intégration Admin Cockpit

Le frontend admin-cockpit expose une page `/kpi-store` avec 3 onglets :

1. **KPI Definitions** — DataTable + modals Create/Edit + toggle actif/inactif
2. **Widget Templates** — DataTable + modals Create/Edit + champ JSON pour `defaultConfig`
3. **KPI Packs** — DataTable + modals Create/Edit avec checkboxes multi-select des KPI definitions actives

**Fichiers frontend :**
```
src/features/kpi-store/
  KpiStorePage.tsx          ← page principale (Tabs)
  KpiDefinitionsTab.tsx
  WidgetTemplatesTab.tsx
  KpiPacksTab.tsx
  CreateKpiDefinitionModal.tsx
  EditKpiDefinitionModal.tsx
  CreateWidgetTemplateModal.tsx
  EditWidgetTemplateModal.tsx
  CreateKpiPackModal.tsx
  EditKpiPackModal.tsx
```
