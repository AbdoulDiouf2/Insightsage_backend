# Module Billing — Facturation & Paiements Stripe (Cockpit)

Ce module gere les abonnements SaaS via **Stripe** : paiement initial, renouvellement automatique, facturation, annulation et portail client.

## Concept

Le flux de paiement fonctionne en 3 couches :

1. **Stripe Checkout** — Le client est redirige vers une page Stripe securisee pour saisir sa carte (ton serveur ne touche jamais les donnees de carte).
2. **Stripe Webhooks** — Stripe appelle `POST /billing/webhook` pour chaque evenement (paiement reussi, echec, annulation). Ton serveur met alors la DB a jour.
3. **Stripe Customer Portal** — Interface Stripe hebergee ou le client peut modifier sa carte, consulter ses factures et gerer son abonnement sans intervention de l'equipe.

## Modeles de donnees

| Modele | Description |
|--------|-------------|
| `BillingCustomer` | Client Stripe lie a l'organisation (1 org → 1 customer) |
| `BillingSubscription` | Abonnement actif, statut, dates de periode |
| `BillingInvoice` | Historique des factures et paiements |

### Enum `BillingStatus`

| Valeur | Description |
|--------|-------------|
| `TRIALING` | Periode d'essai |
| `ACTIVE` | Abonnement actif et a jour |
| `PAST_DUE` | Paiement en retard (Stripe retente automatiquement) |
| `CANCELLED` | Abonnement annule |
| `UNPAID` | Echec definitif apres toutes les retentes |
| `PAUSED` | Suspendu manuellement |

## Routes API

| Methode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/billing/subscription` | Statut abonnement + plan | `read:billing` |
| `GET` | `/billing/invoices` | Historique des factures | `read:billing` |
| `POST` | `/billing/checkout` | Creer session Stripe Checkout → `{ url }` | `manage:billing` |
| `POST` | `/billing/portal` | Ouvrir portail Stripe → `{ url }` | `read:billing` |
| `POST` | `/billing/cancel` | Annuler l'abonnement | `manage:billing` |
| `POST` | `/billing/webhook` | Webhook Stripe (public, verifie par signature) | — |

## RBAC

| Role | `read:billing` | `manage:billing` |
|------|:--------------:|:----------------:|
| `superadmin` | bypass | bypass |
| `owner` | ✓ | ✓ |
| `daf` | ✓ | — |
| `controller` | — | — |
| `analyst` | — | — |

## Securite Webhook

Le endpoint `POST /billing/webhook` est public (pas de JWT) mais verifie la signature HMAC-SHA256 de Stripe :

```typescript
stripe.webhooks.constructEvent(rawBody, stripeSignature, STRIPE_WEBHOOK_SECRET)
```

Toute requete avec une signature invalide retourne `400 Bad Request` immediatement.

## Evenements Stripe traites

| Evenement | Action |
|-----------|--------|
| `checkout.session.completed` | Cree `BillingSubscription` + active `Organization.planId` |
| `invoice.payment_succeeded` | Renouvellement OK → met a jour les dates + enregistre `BillingInvoice` |
| `invoice.payment_failed` | Statut `PAST_DUE` + email d'alerte au proprietaire |
| `customer.subscription.updated` | Synchronise statut, dates, changement de plan |
| `customer.subscription.deleted` | Statut `CANCELLED` + `cancelledAt` |

## Devise

Tous les montants sont en **XOF (Franc CFA)** — entier, pas de decimales (ex: `36000` = 36 000 FCFA).

## Structure

```
src/billing/
  billing.module.ts
  billing.controller.ts
  billing.service.ts             <- CRUD + appels Stripe API
  stripe-webhook.service.ts      <- traitement des evenements
  dto/
    create-checkout.dto.ts       <- { planId, successUrl?, cancelUrl? }
    cancel-subscription.dto.ts   <- { immediately?: boolean }
```

## Variables d'environnement requises

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Commandes a executer

```bash
npm install stripe --legacy-peer-deps
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```
