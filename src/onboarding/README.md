# Onboarding Module - InsightSage

Ce module a pour but de fournir le tunnel de configuration initiale lorsqu'un client instancie son propre espace sur InsightSage.
Il gère une machine à état (State Machine) stockée en base de données (`OnboardingStatus`) qui retient l'état d'avancement du setup pour chaque organisation.

## Cycle de vie & Endpoints (Wizard)

| Étape | Route | Payload | Description |
|-------|-------|---------|-------------|
| **Reprise** | `GET /api/onboarding/status` | N/A | Retourne le statut, l'étape courante (`currentStep`) et permet de reprendre là où l'utilisateur s'était arrêté. |
| **Step 1** | `POST /api/onboarding/step1` | `{ planId }` | Choix du plan d'abonnement. Lie le `SubscriptionPlan` à l'Organisation. |
| **Step 2** | `POST /api/onboarding/step2` | `{ name?, sector?, size?, country? }` | Configuration du profil de l'organisation. |
| **Step 3.A** | `POST /api/onboarding/step3` | `{ sageType, sageMode }` | Indication du type d'instance Sage. |
| **Step 3.B** | `POST /api/onboarding/agent-link` | `{ agentToken }` | Enregistrement de l'Agent Data Syncer on-premise. |
| **Step 4** | `POST /api/onboarding/step4` | `{ profiles: ["DAF", ...] }` | Sélection des profils métiers via les choix offerts sur `GET /api/onboarding/profiles`. |
| **Step 5** | `POST /api/onboarding/step5` | `{ inviteLater: boolean, invitations: [] }`| Envoi des e-mails d'invitation aux collaborateurs et finalisation de l'onboarding. |

## Isolation et Sécurité

Toutes les requêtes d'onboarding identifient formellement l'organisation requérante via le décorateur `@OrganizationId()`. Ce comportement empêche strictement de modifier l'avancement d'un autre tenant.
