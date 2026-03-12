# Module Billing — Facturation & Paiements Flutterwave (Cockpit)

Ce module gere les abonnements SaaS via **Flutterwave** : paiement initial, renouvellement automatique mensuel, historique des factures et annulation.

> Flutterwave a ete choisi a la place de Stripe car il est agree localement en Afrique de l'Ouest (Senegal), supporte le XOF nativement et offre des virements bancaires en ~1 jour ouvre.

## Concept

Le flux de paiement fonctionne en 2 couches :

1. **Flutterwave Hosted Payment** — Le client est redirige vers une page Flutterwave securisee pour saisir ses informations de paiement (ton serveur ne touche jamais les donnees de carte). L'abonnement est lie a un **Payment Plan** Flutterwave.
2. **Flutterwave Webhooks** — Flutterwave appelle `POST /billing/webhook` pour chaque evenement (`charge.completed`, `subscription.cancelled`). Le serveur met alors la DB a jour.

> Il n'y a pas de portail client equivalent dans Flutterwave. Pour modifier ses informations de paiement, le client contacte le support.

## Modeles de donnees

| Modele | Description |
|--------|-------------|
| `BillingCustomer` | Client Flutterwave lie a l'organisation (1 org → 1 customer) |
| `BillingSubscription` | Abonnement actif, statut, dates de periode, `fwSubscriptionId` |
| `BillingInvoice` | Historique des factures — `fwTransactionId` Flutterwave |

### Enum `BillingStatus`

| Valeur | Description |
|--------|-------------|
| `TRIALING` | Periode d'essai |
| `ACTIVE` | Abonnement actif et a jour |
| `PAST_DUE` | Paiement en retard |
| `CANCELLED` | Abonnement annule |
| `UNPAID` | Echec definitif |
| `PAUSED` | Suspendu manuellement |

## Routes API

| Methode | Route | Description | Permission |
|---------|-------|-------------|------------|
| `GET` | `/billing/subscription` | Statut abonnement + plan | `read:billing` |
| `GET` | `/billing/invoices` | Historique des factures | `read:billing` |
| `POST` | `/billing/checkout` | Creer lien paiement Flutterwave → `{ url }` | `manage:billing` |
| `POST` | `/billing/cancel` | Annuler l'abonnement | `manage:billing` |
| `POST` | `/billing/webhook` | Webhook Flutterwave (public, verifie par hash) | — |

## RBAC

| Role | `read:billing` | `manage:billing` |
|------|:--------------:|:----------------:|
| `superadmin` | bypass | bypass |
| `owner` | ✓ | ✓ |
| `daf` | ✓ | — |
| `controller` | — | — |
| `analyst` | — | — |

## Securite Webhook

Le endpoint `POST /billing/webhook` est public (pas de JWT) mais verifie le secret hash Flutterwave via le header `verif-hash` avec une comparaison en **temps constant** (anti-timing attacks) :

```typescript
// Guard : FLW_SECRET_HASH vide → rejeter immédiatement (pas de bypass accidentel)
if (!FLW_SECRET_HASH) throw new UnauthorizedException('Webhook secret not configured');

// Comparaison en temps constant via crypto.timingSafeEqual
const a = Buffer.from(signature);
const b = Buffer.from(FLW_SECRET_HASH);
const isValid = a.length === b.length && crypto.timingSafeEqual(a, b);
if (!isValid) throw new UnauthorizedException('Invalid webhook signature');
```

Toute requete avec un hash invalide retourne `401 Unauthorized` immediatement.

!!! warning "Variable d'environnement obligatoire en production"
    Si `FLW_SECRET_HASH` est vide, **toutes** les requêtes webhook sont rejetées (fail-closed). Configurer cette variable avant d'activer les paiements.

## Evenements Flutterwave traites

| Evenement | Action |
|-----------|--------|
| `charge.completed` (status=successful + payment_plan) | Cree/met a jour `BillingSubscription` + `BillingCustomer` + `BillingInvoice` + active `Organization.planId` |
| `subscription.cancelled` | Statut `CANCELLED` + `cancelledAt` + email alerte proprietaire |

## Champs DB cles

| Modele | Champ FW | Description |
|--------|----------|-------------|
| `SubscriptionPlan` | `fwPlanId` | ID du Payment Plan Flutterwave (ex: `plan_xxx`) |
| `BillingCustomer` | `fwCustomerId` | ID customer retourne par FW dans le webhook |
| `BillingSubscription` | `fwSubscriptionId` | ID abonnement FW (`subscription_id` du webhook) |
| `BillingInvoice` | `fwTransactionId` | ID transaction FW (`id` du webhook `charge.completed`) |

## Devise

Tous les montants sont en **XOF (Franc CFA)** — entiers (ex: `36000` = 36 000 FCFA). Flutterwave supporte XOF nativement.

## Structure

```
src/billing/
  billing.module.ts
  billing.controller.ts
  billing.service.ts                  <- logique metier + appels FW API (axios)
  flutterwave-webhook.service.ts      <- traitement des evenements FW
  dto/
    create-checkout.dto.ts            <- { planId, successUrl? }
    cancel-subscription.dto.ts        <- { immediately?: boolean }
```

## Variables d'environnement requises

```bash
FLW_SECRET_KEY=FLWSECK_LIVE_...      # Cle secrete Flutterwave
FLW_PUBLIC_KEY=FLWPUBK_LIVE_...      # Cle publique (pour le frontend)
FLW_SECRET_HASH=mon_secret_hash      # Secret defini dans FW Dashboard → Webhooks
```

## Configuration Flutterwave Dashboard

1. Creer 3 **Payment Plans** (Settings → Subscriptions → Payment Plans) :
   - Essentiel : 36 000 XOF / mois
   - Business : 100 000 XOF / mois
   - Enterprise : 300 000 XOF / mois
2. Recuperer chaque `plan_id` et le renseigner via `PATCH /admin/subscription-plans/:id` avec `{ "fwPlanId": "plan_xxx" }`
3. Configurer le **Webhook** (Settings → Webhooks) :
   - URL : `https://ton-domaine.com/billing/webhook`
   - Events : `charge.completed` + `subscription.cancelled`
   - Copier le **Secret Hash** dans `FLW_SECRET_HASH`

## Commandes de mise en service

```bash
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```
