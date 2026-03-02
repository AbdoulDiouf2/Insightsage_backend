---
title: Module Abonnements
description: Plans d'abonnement, limites et gestion Stripe
---

# Module Abonnements

Le module Subscriptions gère les plans d'abonnement disponibles sur la plateforme. Les plans définissent les limites et fonctionnalités accessibles à chaque organisation.

## Plans disponibles

| Plan | `name` | Prix/mois | Utilisateurs | KPIs | Widgets | NLQ |
|------|--------|----------:|:------------:|:----:|:-------:|:---:|
| **Startup** | `startup` | 99€ | 3 | 10 | 5 | ❌ |
| **PME** | `pme` | 299€ | 10 | 30 | 15 | ❌ |
| **Business** | `business` | 699€ | 25 | 100 | 50 | ✅ |
| **Enterprise** | `enterprise` | Sur devis | Illimité | Illimité | Illimité | ✅ |

!!! info "`null` = Illimité"
    Pour le plan Enterprise, `maxUsers`, `maxKpis` et `maxWidgets` sont à `null` = pas de limite.

---

## Endpoints

### Public — Sans authentification

#### GET `/subscriptions/plans`

> Retourne tous les plans actifs (`isActive: true`).

Utilisé lors du wizard d'onboarding (étape 1) pour afficher les plans disponibles aux clients.

**Réponse 200 :**
```json
[
  {
    "id": "uuid",
    "name": "startup",
    "label": "Startup",
    "description": "Pour les petites équipes",
    "priceMonthly": 99,
    "maxUsers": 3,
    "maxKpis": 10,
    "maxWidgets": 5,
    "allowedKpiPacks": ["finance"],
    "hasNlq": false,
    "hasAdvancedReports": false,
    "sortOrder": 1
  }
]
```

### Admin — `manage:all` requis

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/admin/subscription-plans` | Lister tous les plans (actifs + inactifs) |
| `POST` | `/admin/subscription-plans` | Créer un plan |
| `GET` | `/admin/subscription-plans/:id` | Détails d'un plan |
| `PATCH` | `/admin/subscription-plans/:id` | Modifier un plan |
| `DELETE` | `/admin/subscription-plans/:id` | Désactiver un plan |

---

## DTO — Création d'un plan

```typescript
class CreateSubscriptionPlanDto {
  @IsString() name: string;          // identifiant unique (slug)
  @IsString() label: string;         // nom affiché

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsNumber()
  priceMonthly?: number;             // null = sur devis

  // Limites (null = illimité)
  @IsOptional() @IsNumber() maxUsers?: number;
  @IsOptional() @IsNumber() maxKpis?: number;
  @IsOptional() @IsNumber() maxWidgets?: number;
  @IsOptional() @IsNumber() maxAgentSyncPerDay?: number;

  // KPI packs autorisés
  @IsArray() @IsString({ each: true })
  allowedKpiPacks: string[];         // ex: ["finance", "stock", "ventes", "rh"]

  // Fonctionnalités
  @IsOptional() @IsBoolean() hasNlq?: boolean;
  @IsOptional() @IsBoolean() hasAdvancedReports?: boolean;

  // Stripe (futur billing)
  @IsOptional() @IsString() stripeProductId?: string;
  @IsOptional() @IsString() stripePriceId?: string;

  @IsOptional() @IsNumber() sortOrder?: number;
}
```

---

## KPI Packs

Les KPI packs contrôlent les catégories d'indicateurs accessibles :

| Pack | Contenu |
|------|---------|
| `finance` | CA, marges, trésorerie, AR Aging |
| `stock` | Niveaux de stock, rotations, ruptures |
| `ventes` | Commandes, pipeline, top clients |
| `rh` | Effectifs, masse salariale, absentéisme |

---

## Désactivation d'un plan

La suppression d'un plan ne supprime **pas** les organisations qui y sont abonnées. Elle passe `isActive = false`, ce qui retire le plan de la liste publique des plans disponibles.

```typescript
// DELETE /admin/subscription-plans/:id
await prisma.subscriptionPlan.update({
  where: { id },
  data: { isActive: false },
});
```

!!! warning "Migration vers un autre plan"
    Avant de désactiver un plan, vérifiez qu'aucune organisation active n'y est associée
    et migrez-les vers un autre plan via `PATCH /admin/organizations/:id { planId: "..." }`.

---

## Intégration Stripe (futur)

Les champs `stripeProductId` et `stripePriceId` sont prévus pour l'intégration billing :

```typescript
// Workflow futur
// 1. Créer le produit sur Stripe
// 2. Associer les IDs au plan Cockpit
// 3. Gérer les webhooks Stripe pour les changements d'abonnement
```
