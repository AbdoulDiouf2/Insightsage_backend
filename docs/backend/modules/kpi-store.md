---
title: Module KPI Store
description: Gestion des KPI Definitions, Widget Templates et KPI Packs — 114 KPIs Sage 100
---

# Module KPI Store

Le module KPI Store centralise les métadonnées nécessaires au cockpit CFO/DAF :
- **KPI Definitions** : catalogue enrichi de 114 indicateurs clés (issu de `kpi-bis.json`)
- **Widget Templates** : 8 types de visualisation disponibles (dont `pie`, `map`, `text`)
- **KPI Packs** : 12 packs générés dynamiquement par catégorie métier

Les données sont exposées côté **client** (filtré par plan) via `GET /widget-store` et côté **admin** via les endpoints `/admin/kpi-*`.

---

## Modèles Prisma

### KpiDefinition (`kpi_definitions`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `key` | String (unique) | Clé machine préfixée : `f01_ca_ht`, `s03_stocks_dormants`… |
| `code` | String? | Code court : `KPI-F01`, `KPI-S03`… |
| `name` | String | Nom affiché |
| `domain` | String? | Domaine métier : `Finance & Trésorerie`, `Stocks & Logistique`… |
| `description` | String? | Description fonctionnelle |
| `category` | String | Catégorie : `finance`, `tresorerie`, `clients`, `stocks`… |
| `subcategory` | String? | Sous-catégorie : `Revenus`, `Trésorerie / Risque Client`… |
| `usage` | String? | Cas d'usage métier (long text) |
| `unit` | String? | Unité : `€`, `%`, `jours`, `ratio` |
| `frequency` | String? | Fréquence de suivi : `Mensuel / Annuel`, `Quotidien`… |
| `risk` | String? | Niveau de risque : `Faible` \| `Moyen` \| `Élevé` |
| `profiles` | String[] | Profils cibles : `["DAF", "CFO", "DG"]` |
| `sectors` | String[] | Secteurs applicables : `["Tous secteurs"]`, `["Commerce"]`… |
| `defaultVizType` | String | Viz par défaut : `gauge` \| `bar` \| `line` \| `table` \| `pie` \| `map` \| `text` |
| `direction` | String | `HIGHER_IS_BETTER` \| `LOWER_IS_BETTER` |
| `sqlSage100View` | String? | Vue Sage 100 principale : `VW_Finances_Clients_Flat` |
| `sqlSage100Tables` | String[] | Tables Sage 100 sous-jacentes : `["F_COMPTET", "G_ECRITUREC"]` |
| `mlUsage` | String? | Usage Machine Learning / IA prédictif |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

!!! note "Champ `direction`"
    Utilisé par le dashboard pour afficher la flèche de tendance correctement (↑ ou ↓) et comparer au target. Les KPIs de type DSO, DPO, Taux Impayés, BFR sont marqués `LOWER_IS_BETTER`.

### WidgetTemplate (`widget_templates`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String | Nom affiché |
| `vizType` | String (unique) | Type : `card` \| `bar` \| `line` \| `gauge` \| `table` \| `pie` \| `map` \| `text` |
| `description` | String? | Description |
| `defaultConfig` | Json | Config JSON par défaut |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

### KpiPack (`kpi_packs`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String (unique) | Identifiant : `pack_finance`, `pack_clients`… |
| `label` | String | Nom affiché : "Pack Finance" |
| `profile` | String | Profil métier référent : `daf` \| `dg` \| `controller` \| `manager` \| `analyst` |
| `kpiKeys` | String[] | Clés KPI incluses |
| `description` | String? | Description du pack |
| `isActive` | Boolean | Soft delete toggle |
| `createdAt` | DateTime | Date de création |

---

## Données seedées (`prisma/seed.ts`)

!!! warning "Reset destructif"
    Le seed commence par `deleteMany()` sur Widgets → NlqTemplate → NlqIntent → KpiPack → KpiDefinition.
    Tout re-seed depuis `kpi-bis.json` est une remise à zéro propre.

### Source : `prisma/kpi-bis.json`

Le fichier `kpi-bis.json` contient 126 entrées brutes. Le seed déduplique automatiquement les 12 clés en doublon, résultant en **114 KPIs uniques**.

### 12 KPI Packs générés (par catégorie)

| Pack | KPIs | Inclus dans |
|------|------|-------------|
| `pack_finance` | 15 | Essentiel, Business, Enterprise |
| `pack_tresorerie` | 11 | Essentiel, Business, Enterprise |
| `pack_clients` | 20 | Business, Enterprise |
| `pack_fournisseurs` | 10 | Business, Enterprise |
| `pack_stocks` | 11 | Business, Enterprise |
| `pack_comptabilite` | 10 | Business, Enterprise |
| `pack_analytique` | 9 | Business, Enterprise |
| `pack_commandes` | 5 | Business, Enterprise |
| `pack_audit` | 5 | Enterprise uniquement |
| `pack_rh` | 4 | Enterprise uniquement |
| `pack_immobilisations` | 4 | Enterprise uniquement |
| `pack_ml_ia` | 10 | Enterprise uniquement |

### 8 Widget Templates

| vizType | Nom | Usage |
|---------|-----|-------|
| `card` | Carte KPI | Valeur unique avec tendance |
| `bar` | Graphique Barres | Comparaisons périodes/catégories |
| `line` | Courbe Temporelle | Évolution dans le temps |
| `gauge` | Jauge | Ratio ou objectif circulaire |
| `table` | Tableau | Données détaillées paginées |
| `pie` | Camembert | Répartition en secteurs |
| `map` | Carte Géographique | Visualisation géographique |
| `text` | Texte / Commentaire | Bloc narratif ou KPI commenté |

### Plans d'abonnement et packs autorisés

| Plan | `allowedKpiPacks` |
|------|-------------------|
| **Essentiel** | `pack_finance`, `pack_tresorerie` |
| **Business** | + `pack_clients`, `pack_fournisseurs`, `pack_stocks`, `pack_comptabilite`, `pack_analytique`, `pack_commandes` |
| **Enterprise** | `all` (les 12 packs) |

---

## Endpoints Admin — `/admin/kpi-*`

!!! warning "Permissions"
    Tous ces endpoints requièrent `manage:all` (rôle `superadmin`).

### KPI Definitions

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/admin/kpi-definitions` | Lister toutes (actives + inactives) |
| `GET` | `/admin/kpi-definitions/:id` | Détail d'une KPI Definition |
| `POST` | `/admin/kpi-definitions` | Créer une nouvelle KPI Definition |
| `PATCH` | `/admin/kpi-definitions/:id` | Modifier partiellement |
| `DELETE` | `/admin/kpi-definitions/:id` | Toggle `isActive` (soft delete/reactivate) |

**Champs acceptés en création/modification :** `key`, `code`, `name`, `domain`, `description`, `category`, `subcategory`, `usage`, `unit`, `frequency`, `risk`, `profiles[]`, `sectors[]`, `defaultVizType`, `direction`, `sqlSage100View`, `sqlSage100Tables[]`, `mlUsage`, `isActive`.

**`defaultVizType` valeurs acceptées :** `gauge`, `bar`, `card`, `kpi`, `line`, `table`, `pie`, `map`, `text`

**`direction` valeurs acceptées :** `HIGHER_IS_BETTER`, `LOWER_IS_BETTER`

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
2. Filtre les `KpiPacks` selon ces packs autorisés (ou `all` pour Enterprise)
3. Enrichit chaque pack avec les détails des `KpiDefinition` (tous les nouveaux champs inclus)
4. Retourne également tous les `WidgetTemplate` actifs

**Réponse 200 :**
```json
{
  "kpiPacks": [
    {
      "id": "uuid",
      "name": "pack_finance",
      "label": "Pack Finance",
      "profile": "daf",
      "kpiKeys": ["f01_ca_ht", "f03_marge_brute"],
      "kpis": [
        {
          "key": "f01_ca_ht",
          "code": "KPI-F01",
          "name": "Chiffre d'Affaires (CA) HT",
          "domain": "Finance & Trésorerie",
          "category": "finance",
          "subcategory": "Revenus",
          "unit": "€",
          "defaultVizType": "bar",
          "direction": "HIGHER_IS_BETTER",
          "profiles": ["DAF", "CFO", "DG"],
          "sectors": ["Tous secteurs"]
        }
      ]
    }
  ],
  "kpiDefinitions": [...],
  "widgetTemplates": [...]
}
```

---

## NLQ — Intégration automatique

Pour chaque KPI seedé, le seed crée automatiquement :
- Un **`NlqIntent`** (`key`, `label`, `keywords[]`, `category`)
- Un **`NlqTemplate`** Sage 100 (`intentKey`, `sageType: '100'`, `sqlQuery`, `defaultVizType`)
- Un **`NlqTemplate`** Sage X3 si `sqlSageX3` est renseigné dans le JSON

Le `intentKey` correspond exactement au `key` de la `KpiDefinition` (ex: `f01_ca_ht`).

---

## Comportement du soft delete

!!! info "Toggle isActive"
    Le `DELETE /:id` ne supprime pas l'enregistrement — il bascule `isActive` entre `true` et `false`.

    - Premier appel : `isActive` → `false` (désactivé)
    - Deuxième appel : `isActive` → `true` (réactivé)

---

## Intégration Admin Cockpit

Le frontend admin-cockpit expose une page `/kpi-store` avec 3 onglets.

### KPI Definitions — champs affichés et éditables

| Section | Champs |
|---------|--------|
| Header | `name`, `code` (badge), `key` (code) |
| Détails | `domain`, `category`/`subcategory`, `unit`, `frequency`, `risk`, `direction`, `status` |
| Narrative | `description`, `usage` |
| Badges | `profiles[]`, `sectors[]` |
| Source Sage 100 | `sqlSage100View`, `sqlSage100Tables[]` |
| ML / IA | `mlUsage` |

### Formulaires Create / Edit

- `category` : champ texte libre (plus d'enum restrictif)
- `defaultVizType` : select parmi `card`, `gauge`, `bar`, `line`, `table`, `pie`, `map`, `text`
- Champs optionnels supplémentaires : `code`, `domain`, `subcategory`

### Fichiers frontend

```
src/features/kpi-store/
  KpiStorePage.tsx
  KpiDefinitionsTab.tsx
  KpiDefinitionDetailPage.tsx      ← affiche tous les nouveaux champs
  CreateKpiDefinitionModal.tsx     ← formulaire enrichi
  EditKpiDefinitionModal.tsx       ← formulaire enrichi
  WidgetTemplatesTab.tsx
  CreateWidgetTemplateModal.tsx
  EditWidgetTemplateModal.tsx
  KpiPacksTab.tsx
  CreateKpiPackModal.tsx
  EditKpiPackModal.tsx

src/types/index.ts                 ← interface KpiDefinition mise à jour
```

---

## Commandes de maintenance

```bash
# Regénérer le client Prisma après modification du schéma
npx prisma generate

# Appliquer les changements de schéma (sans migration)
npx prisma db push

# Relancer le seed complet (reset + re-import)
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

!!! danger "Seed destructif"
    Le seed supprime tous les KPIs, Packs, NlqIntents, NlqTemplates et Widgets existants avant de réinsérer. Ne pas lancer en production sans validation.
