---
title: Emails transactionnels (Mailer)
description: Module d'envoi d'emails transactionnels via SMTP — Cockpit API
---

# Module Mailer — Emails transactionnels

Le module `MailerModule` gère tous les emails transactionnels de la plateforme Cockpit via **Nodemailer** et un transport SMTP configurable. En l'absence de configuration SMTP (mode développement), les emails sont loggés en console sans lever d'erreur.

---

## Architecture

```
src/mailer/
  mailer.module.ts          ← @Global() NestJS module
  mailer.service.ts         ← Transport Nodemailer + fallback dev
  templates/
    reset-password.html     ← Template HTML reset mot de passe
    invitation.html         ← Template HTML invitation utilisateur
    welcome-setup.html      ← Template HTML welcome nouveau DAF
```

Le module est déclaré `@Global()` dans `AppModule` — il est donc disponible dans tous les modules sans import explicite.

---

## Configuration SMTP

Toutes les variables sont dans `.env.*`. Aucune n'est obligatoire en développement.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `SMTP_HOST` | *(vide)* | Hôte du serveur SMTP. Si absent → mode console |
| `SMTP_PORT` | `587` | Port SMTP |
| `SMTP_SECURE` | `false` | `true` pour SSL/TLS (port 465) |
| `SMTP_USER` | *(vide)* | Identifiant SMTP |
| `SMTP_PASS` | *(vide)* | Mot de passe SMTP |
| `SMTP_FROM` | `Cockpit <noreply@…>` | Expéditeur affiché |

```env
SMTP_HOST=smtp.client.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@client.com
SMTP_PASS=xxxxxxx
SMTP_FROM="Cockpit <noreply@client.com>"
```

!!! info "Mode développement"
    Si `SMTP_HOST` est vide, le `MailerService` log les liens en console avec le préfixe `[DEV]` et retourne sans erreur. Aucun SMTP n'est requis pour développer.

!!! tip "Connexion SMTP prod"
    Quand le client fournit ses accès serveur SMTP, il suffit de renseigner les 5 variables dans `.env.prod` et redémarrer le serveur. Aucun changement de code.

---

## Emails envoyés

### 1. Reset mot de passe

**Déclenché par :** `POST /auth/forgot-password`
**Service :** `AuthService.forgotPassword()`
**Template :** `reset-password.html`

| Paramètre | Valeur |
|-----------|--------|
| Destinataire | L'utilisateur ayant soumis sa demande |
| Lien | `${FRONTEND_URL}/reset-password?token=<token>` |
| Expiration | 1 heure (géré en DB : `resetPasswordExpires`) |
| Objet | `Réinitialisation de votre mot de passe Cockpit` |

!!! warning "Sécurité"
    Le token de reset n'est **jamais** retourné dans la réponse HTTP (même en dev). Il transite uniquement par email (ou log console en dev).

---

### 2. Invitation utilisateur

**Déclenché par :** `POST /auth/invite` et `POST /onboarding/step5`
**Service :** `AuthService.inviteUser()`
**Template :** `invitation.html`

| Paramètre | Valeur |
|-----------|--------|
| Destinataire | L'adresse email invitée |
| Lien | `${FRONTEND_URL}/accept-invitation?token=<token>` |
| Expiration | 7 jours (géré en DB : `Invitation.expiresAt`) |
| Objet | `Vous avez été invité à rejoindre <OrgName> sur Cockpit` |
| Variables template | `orgName`, `role`, `expiresIn` |

---

### 3. Welcome + Setup compte (nouveau DAF)

**Déclenché par :** `POST /admin/clients` (SuperAdmin crée un nouveau client)
**Service :** `AdminService.createClientAccount()`
**Template :** `welcome-setup.html`

| Paramètre | Valeur |
|-----------|--------|
| Destinataire | L'email admin DAF du nouveau client |
| Lien | `${FRONTEND_URL}/reset-password?token=<token>` (création de mot de passe initial) |
| Expiration | 7 jours |
| Objet | `Bienvenue sur Cockpit — Configurez votre compte <OrgName>` |
| Variables template | `orgName`, `setupLink` |

!!! note "Mot de passe temporaire"
    Le DAF est créé avec un mot de passe aléatoire inutilisable. Le lien welcome-setup permet de définir son vrai mot de passe via le même flow que `reset-password`.

---

## API du MailerService

```typescript
// Réinitialisation de mot de passe
sendResetPasswordEmail(email: string, token: string): Promise<void>

// Invitation d'un utilisateur
sendInvitationEmail(
  email: string,
  token: string,
  orgName: string,
  role: string,
): Promise<void>

// Welcome + setup compte nouveau DAF
sendWelcomeSetupEmail(
  email: string,
  token: string,
  orgName: string,
): Promise<void>
```

---

## Système de templates

Les templates HTML sont stockés dans `src/mailer/templates/`. Le `MailerService` charge le fichier, remplace les variables `{{key}}` par les valeurs passées, et envoie le HTML résultant.

```typescript
// Remplacement de variables : {{resetLink}}, {{orgName}}, etc.
private loadTemplate(filename: string, variables: Record<string, string>): string
```

Les templates utilisent du HTML inline CSS pour une compatibilité maximale avec les clients email (Gmail, Outlook, Apple Mail…).

---

## Intégration dans les modules

Le `MailerService` est injecté directement dans :

| Module | Service | Méthode | Email |
|--------|---------|---------|-------|
| `auth` | `AuthService` | `forgotPassword()` | Reset mot de passe |
| `auth` | `AuthService` | `inviteUser()` | Invitation |
| `admin` | `AdminService` | `createClientAccount()` | Welcome setup |
