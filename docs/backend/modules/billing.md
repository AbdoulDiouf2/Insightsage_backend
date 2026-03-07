---
title: Facturation & Paiements (Billing)
description: Module de gestion des abonnements SaaS via Flutterwave — Cockpit API
---

# Module Billing — Facturation & Paiements

Le module `BillingModule` gere l'integralite du cycle de vie des abonnements SaaS Cockpit via **Flutterwave** : paiement initial, renouvellement automatique mensuel, historique des factures et annulation.

> **Pourquoi Flutterwave ?** Agree localement en Afrique de l'Ouest (Senegal), supporte le XOF nativement, virements bancaires en ~1 jour ouvre (vs 4-10 jours cross-border pour Stripe).

---

## Comment ca marche

```
Client choisit un plan
        ↓
POST /billing/checkout → lien Flutterwave Hosted Payment → { url }
        ↓
Client saisit ses infos sur flutterwave.com (ton serveur ne touche pas les donnees de carte)
        ↓
Flutterwave appelle POST /billing/webhook → charge.completed
        ↓
Ton serveur active BillingSubscription + Organisation.planId
        ↓
Chaque mois, Flutterwave preleve automatiquement (Payment Plan)
        ↓
charge.completed → BillingInvoice enregistree
subscription.cancelled → email d'alerte + statut CANCELLED
```

---

## Architecture

```
src/billing/
  billing.module.ts
  billing.controller.ts               <- 5 endpoints
  billing.service.ts                  <- logique metier + Flutterwave REST API (axios)
  flutterwave-webhook.service.ts      <- traitement evenements FW
  dto/
    create-checkout.dto.ts
    cancel-subscription.dto.ts
```

---

## Modele de donnees

### Enum `BillingStatus`

| Valeur | Description |
|--------|-------------|
| `TRIALING` | Periode d'essai en cours |
| `ACTIVE` | Abonnement actif et paiements a jour |
| `PAST_DUE` | Paiement en retard |
| `CANCELLED` | Abonnement annule (fin de periode ou immediat) |
| `UNPAID` | Echec definitif apres toutes les retentes |
| `PAUSED` | Suspendu manuellement |

### Modele `BillingCustomer`

```prisma
model BillingCustomer {
  id             String   @id @default(uuid())
  organizationId String   @unique
  fwCustomerId   String?  @unique  // customer_id retourne par FW webhook
  email          String
  createdAt      DateTime
  updatedAt      DateTime
}
```

Le `BillingCustomer` est cree lors du premier checkout. Le `fwCustomerId` est renseigne lors de la reception du premier webhook `charge.completed`.

### Modele `BillingSubscription`

```prisma
model BillingSubscription {
  id               String        @id @default(uuid())
  organizationId   String        @unique
  fwSubscriptionId String?       @unique  // subscription_id retourne par FW
  planId           String        // FK → SubscriptionPlan
  status           BillingStatus @default(TRIALING)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean     @default(false)
  trialEndsAt        DateTime?
  cancelledAt        DateTime?
}
```

### Modele `BillingInvoice`

```prisma
model BillingInvoice {
  id              String   @id @default(uuid())
  organizationId  String
  subscriptionId  String
  fwTransactionId String   @unique  // transaction_id Flutterwave
  amountPaid      Int      // en XOF, entier (ex: 36000)
  currency        String   @default("xof")
  status          String   // "paid" | "open" | "failed"
  pdfUrl          String?
  hostedUrl       String?
  paidAt          DateTime?
}
```

### Champ `SubscriptionPlan.fwPlanId`

Chaque plan doit avoir son `fwPlanId` renseigne — c'est l'ID du Payment Plan cree dans le Dashboard Flutterwave :

| Plan | Prix | Champ |
|------|------|-------|
| Essentiel | 36 000 XOF/mois | `fwPlanId: "plan_xxx"` |
| Business | 100 000 XOF/mois | `fwPlanId: "plan_yyy"` |
| Enterprise | 300 000 XOF/mois | `fwPlanId: "plan_zzz"` |

---

## Endpoints

| Methode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/billing/subscription` | Statut abonnement + plan souscrit | `read:billing` |
| `GET` | `/billing/invoices` | Historique des factures triees par date | `read:billing` |
| `POST` | `/billing/checkout` | Creer lien paiement Flutterwave | `manage:billing` |
| `POST` | `/billing/cancel` | Annuler l'abonnement | `manage:billing` |
| `POST` | `/billing/webhook` | Webhook Flutterwave **(public, hash verifie)** | — |

### `POST /billing/checkout` — Payload

```json
{
  "planId": "uuid-plan-business",
  "successUrl": "https://app.cockpit.io/billing/success"
}
```

!!! info "successUrl optionnel"
    Si non fourni, l'URL par defaut est `FRONTEND_URL/billing/success`.

**Reponse :**

```json
{
  "url": "https://checkout.flutterwave.com/v3/hosted/pay/xxx..."
}
```

Le frontend redirige le client vers cette URL. Apres paiement, Flutterwave redirige vers `successUrl`.

### `POST /billing/cancel` — Payload

```json
{
  "immediately": false
}
```

| `immediately` | Comportement |
|--------------|-------------|
| `false` (defaut) | Annulation a la fin de la periode — l'acces reste actif jusqu'a `currentPeriodEnd` |
| `true` | Annulation immediate via API Flutterwave (`PUT /v3/subscriptions/{id}/cancel`) |

### `POST /billing/webhook` — Securite

!!! warning "Ne pas appeler manuellement"
    Cet endpoint est appele exclusivement par Flutterwave. Chaque requete est verifiee via le header `verif-hash`.

```typescript
if (verif-hash !== FLW_SECRET_HASH) → 401 Unauthorized
```

---

## Evenements Flutterwave traites

| Evenement | Condition | Action dans Cockpit |
|-----------|-----------|---------------------|
| `charge.completed` | `status === "successful"` + `payment_plan` present | Upsert `BillingSubscription` (ACTIVE) + `BillingCustomer` + `BillingInvoice` + `Organization.planId` |
| `subscription.cancelled` | — | Statut → `CANCELLED` + `cancelledAt` + email alerte proprietaire |

!!! note "Periode calculee"
    Flutterwave ne retourne pas de dates de periode explicites dans le webhook. Le backend calcule : `currentPeriodStart = now()`, `currentPeriodEnd = now() + 1 mois`.

---

## RBAC

| Role | `read:billing` | `manage:billing` |
|------|:--------------:|:----------------:|
| `superadmin` | bypass (`manage:all`) | bypass |
| `owner` | ✓ | ✓ |
| `daf` | ✓ | — |
| `controller` | — | — |
| `analyst` | — | — |

!!! note "Owner uniquement pour manage"
    Seul le proprietaire (`owner`) peut souscrire, annuler ou changer de plan. Le DAF peut uniquement consulter.

---

## Configuration requise

### Variables d'environnement

```bash
FLW_SECRET_KEY=FLWSECK_LIVE_...      # Cle secrete (Dashboard → Settings → API Keys)
FLW_PUBLIC_KEY=FLWPUBK_LIVE_...      # Cle publique (pour le frontend)
FLW_SECRET_HASH=mon_secret_hash      # Secret defini dans Dashboard → Webhooks
```

### Setup Flutterwave Dashboard

1. **Creer les Payment Plans** (Settings → Subscriptions → Payment Plans) :
   - Nom : "Cockpit Essentiel" / Montant : 36 000 / Devise : XOF / Interval : monthly
   - Nom : "Cockpit Business" / Montant : 100 000 / Devise : XOF / Interval : monthly
   - Nom : "Cockpit Enterprise" / Montant : 300 000 / Devise : XOF / Interval : monthly

2. **Renseigner les `fwPlanId`** dans le panel SuperAdmin :
   ```
   PATCH /admin/subscription-plans/:id
   Body: { "fwPlanId": "plan_xxxxxxxx" }
   ```

3. **Configurer le Webhook** (Settings → Webhooks) :
   - URL : `https://ton-domaine.com/billing/webhook`
   - Events : `charge.completed` + `subscription.cancelled`
   - Copier le **Secret Hash** dans `FLW_SECRET_HASH`

---

## Audit log

| Action | Evenement |
|--------|-----------|
| Lien checkout initie | `billing_checkout_initiated` |
| Paiement reussi | `payment_succeeded` |
| Abonnement annule | `subscription_cancelled` |

---

## Commandes de mise en service

```bash
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```
