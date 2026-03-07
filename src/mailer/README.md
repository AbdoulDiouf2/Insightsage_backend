# Module Mailer (Cockpit)

Ce module gère tous les emails transactionnels de la plateforme via **Nodemailer** et un transport SMTP configurable. Déclaré `@Global()`, il est disponible dans tous les modules sans import explicite.

## Comportement dev / prod

Si `SMTP_HOST` est absent dans les variables d'environnement, le service ne lève pas d'erreur et log les liens en console avec le préfixe `[DEV]`. Aucun serveur SMTP n'est requis pour développer.

## Emails envoyés

| Email | Déclenché par | Template |
|-------|--------------|----------|
| Reset mot de passe | `AuthService.forgotPassword()` | `reset-password.html` |
| Invitation utilisateur | `AuthService.inviteUser()` | `invitation.html` |
| Welcome + setup DAF | `AdminService.createClientAccount()` | `welcome-setup.html` |

## Variables d'environnement

```env
SMTP_HOST=          # Hôte SMTP — vide = mode console (dev)
SMTP_PORT=587
SMTP_SECURE=false   # true pour SSL/TLS port 465
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Cockpit <noreply@votre-domaine.com>"
```

## Structure

```
src/mailer/
  mailer.module.ts          ← @Global() NestJS module
  mailer.service.ts         ← 3 méthodes publiques + transport nodemailer
  templates/
    reset-password.html     ← Lien valable 1h
    invitation.html         ← Lien valable 7j (orgName + role)
    welcome-setup.html      ← Lien setup initial pour nouveau DAF
```

## API publique

```typescript
sendResetPasswordEmail(email: string, token: string): Promise<void>
sendInvitationEmail(email: string, token: string, orgName: string, role: string): Promise<void>
sendWelcomeSetupEmail(email: string, token: string, orgName: string): Promise<void>
```

Les liens sont construits avec `FRONTEND_URL` (déjà présent dans les variables d'env).
