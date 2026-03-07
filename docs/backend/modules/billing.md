---
title: Facturation & Paiements (Billing)
description: Module de gestion des abonnements SaaS via Stripe — Cockpit API
---

# Module Billing — Facturation & Paiements

Le module `BillingModule` gere l'integralite du cycle de vie des abonnements SaaS Cockpit via **Stripe** : paiement initial, renouvellement automatique mensuel, historique des factures, portail client et annulation.

---

## Comment ca marche

```
Client choisit un plan
        ↓
POST /billing/checkout → session Stripe Checkout → { url }
        ↓
Client saisit sa carte sur stripe.com (ton serveur ne touche pas les donnees de carte)
        ↓
Stripe appelle POST /billing/webhook → checkout.session.completed
        ↓
Ton serveur active BillingSubscription + Organisation.planId
        ↓
Chaque mois, Stripe preleve automatiquement
        ↓
invoice.payment_succeeded → BillingInvoice enregistree
invoice.payment_failed    → email d'alerte + statut PAST_DUE
```

---

## Architecture

```
src/billing/
  billing.module.ts
  billing.controller.ts          <- 6 endpoints
  billing.service.ts             <- logique metier + Stripe API
  stripe-webhook.service.ts      <- traitement evenements Stripe
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
| `PAST_DUE` | Paiement en retard — Stripe retente automatiquement (Smart Retries) |
| `CANCELLED` | Abonnement annule (fin de periode ou immediat) |
| `UNPAID` | Echec definitif apres toutes les retentes Stripe |
| `PAUSED` | Suspendu manuellement |

### Modele `BillingCustomer`

```prisma
model BillingCustomer {
  id               String  @id @default(uuid())
  organizationId   String  @unique
  stripeCustomerId String  @unique  // "cus_xxxx"
  email            String
  createdAt        DateTime
  updatedAt        DateTime
}
```

Un customer Stripe est cree automatiquement lors du premier checkout. La relation est 1 organisation → 1 customer Stripe.

### Modele `BillingSubscription`

```prisma
model BillingSubscription {
  id                   String        @id @default(uuid())
  organizationId       String        @unique
  stripeSubscriptionId String        @unique  // "sub_xxxx"
  planId               String        // FK → SubscriptionPlan
  status               BillingStatus @default(TRIALING)
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean       @default(false)
  trialEndsAt          DateTime?
  cancelledAt          DateTime?
}
```

### Modele `BillingInvoice`

```prisma
model BillingInvoice {
  id              String  @id @default(uuid())
  organizationId  String
  subscriptionId  String
  stripeInvoiceId String  @unique  // "in_xxxx"
  amountPaid      Int     // en XOF, entier (ex: 36000)
  currency        String  @default("xof")
  status          String  // "paid" | "open" | "void"
  pdfUrl          String?
  hostedUrl       String?
  paidAt          DateTime?
}
```

---

## Endpoints

| Methode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/billing/subscription` | Statut abonnement + plan souscrit | `read:billing` |
| `GET` | `/billing/invoices` | Historique des factures triees par date | `read:billing` |
| `POST` | `/billing/checkout` | Creer session Stripe Checkout | `manage:billing` |
| `POST` | `/billing/portal` | Ouvrir portail Stripe (carte, factures) | `read:billing` |
| `POST` | `/billing/cancel` | Annuler l'abonnement | `manage:billing` |
| `POST` | `/billing/webhook` | Webhook Stripe **(public, signature verifiee)** | — |

### `POST /billing/checkout` — Payload

```json
{
  "planId": "uuid-plan-business",
  "successUrl": "https://app.cockpit.io/billing/success",
  "cancelUrl": "https://app.cockpit.io/billing/cancel"
}
```

!!! info "successUrl / cancelUrl optionnels"
    Si non fournis, les URLs par defaut sont `FRONTEND_URL/billing/success` et `FRONTEND_URL/billing/cancel`.

**Reponse :**

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_live_xxx..."
}
```

Le frontend redirige le client vers cette URL. Apres paiement, Stripe redirige vers `successUrl`.

### `POST /billing/cancel` — Payload

```json
{
  "immediately": false
}
```

| `immediately` | Comportement |
|--------------|-------------|
| `false` (defaut) | Annulation a la fin de la periode — l'acces reste actif jusqu'a `currentPeriodEnd` |
| `true` | Annulation immediate — l'acces est coupe maintenant |

### `POST /billing/webhook` — Securite

!!! warning "Ne pas appeler manuellement"
    Cet endpoint est appele exclusivement par Stripe. Chaque requete est verifiee via la signature HMAC-SHA256 dans le header `stripe-signature`.

```
stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
```

Si la signature est invalide → `400 Bad Request` immediat.

---

## Evenements Stripe traites

| Evenement | Action dans Cockpit |
|-----------|---------------------|
| `checkout.session.completed` | Cree `BillingSubscription` + `BillingCustomer` + active `Organization.planId` |
| `invoice.payment_succeeded` | Renouvellement OK → met a jour `currentPeriodEnd` + cree `BillingInvoice` |
| `invoice.payment_failed` | Statut → `PAST_DUE` + email d'alerte proprietaire |
| `customer.subscription.updated` | Synchronise statut, dates, `cancelAtPeriodEnd`, changement de plan |
| `customer.subscription.deleted` | Statut → `CANCELLED` + `cancelledAt` |

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
    Seul le proprietaire (`owner`) peut souscrire, annuler ou changer de plan. Le DAF peut consulter les factures et le statut.

---

## Configuration requise

### Variables d'environnement

```bash
STRIPE_SECRET_KEY=sk_live_...       # cle secrete Stripe
STRIPE_PUBLISHABLE_KEY=pk_live_...  # cle publique (pour le frontend)
STRIPE_WEBHOOK_SECRET=whsec_...     # secret webhook (Dashboard Stripe → Webhooks)
```

### Plans Stripe

Chaque `SubscriptionPlan` doit avoir `stripePriceId` renseigne. Ces IDs sont obtenus depuis le Dashboard Stripe apres creation des produits :

| Plan | Champ | Exemple |
|------|-------|---------|
| Essentiel | `stripePriceId` | `price_1AbcDef...` |
| Business | `stripePriceId` | `price_2GhiJkl...` |
| Enterprise | `stripePriceId` | `price_3MnoPqr...` |

---

## Devise

Tous les montants sont en **XOF (Franc CFA UEMOA)** — Stripe traite les devises a zero decimale, donc on passe les montants en entiers : `36000` = 36 000 FCFA.

---

## Audit log

| Action | Evenement |
|--------|-----------|
| Session checkout initiee | `billing_checkout_initiated` |
| Portail ouvert | `billing_portal_opened` |
| Abonnement cree | `subscription_created` |
| Abonnement mis a jour | `subscription_updated` |
| Abonnement annule | `subscription_cancelled` |
| Paiement reussi | `payment_succeeded` |
| Paiement echoue | `payment_failed` |

---

## Commandes a executer

```bash
npm install stripe --legacy-peer-deps
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```
