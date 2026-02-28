# Module Auth & RBAC (InsightSage)

Ce module gère toute l'authentification, la création des comptes (y compris les organisations) et les permissions pour le projet MVP InsightSage. Il s'appuie sur `Passport`, `@nestjs/jwt`, `bcrypt` et s'interface avec `Prisma` pour le stockage en base de données.

## Fonctionnalités Principales

1. **Inscription et Création d'Organisation (`/auth/register`)**
   - Crée l'utilisateur initial (qui devient le *owner*).
   - Crée automatiquement une coquille vide pour l'`Organization` liée.
   - Si un `invitationToken` est fourni, l'utilisateur rejoint directement l'organisation existante au lieu d'en créer une nouvelle.
   - Hashage du mot de passe avec `bcrypt`.
2. **Connexion (`/auth/login`) et Déconnexion (`/auth/logout`)**
   - Génère un couple de tokens courts et longs : `access_token` (valide 15m) et `refresh_token` (valide 7j).
   - Le `refresh_token` est haché en base de données pour la sécurité (stocké dans `hashedRefreshToken`).
   - La déconnexion invalide le `refresh_token` en le supprimant de la base de données.
3. **Rotation de Tokens (`/auth/refresh`)**
   - Valide le `refresh_token` envoyé dans le header `Authorization: Bearer <RT>`.
   - Regénère un nouveau couple Access/Refresh tokens pour maintenir la session active.
4. **Récupération de mot de passe**
   - `/auth/forgot-password` génère un jeton temporaire aléatoire permettant à l'utilisateur de réinitialiser son mot de passe (valide 1 heure).
   - `/auth/reset-password` vérifie le jeton et applique le nouveau mot de passe haché.
5. **Système d'Invitations (`/auth/invite`)**
   - Route protégée. Permet d'inviter un nouvel utilisateur dans une organisation spécifique avec un rôle métier prédéfini (par ex. `controller`).
   - Génère une URL/Token à distribuer par email.

## Routes API Disponibles

Toutes les routes sont préfixées par `/api/auth/` (ou le path global que vous avez défini dans NestJS). La documentation Swagger détaillée est disponible via `/api`.

| Méthode | Route                | Description                                        | Protection (Guards)          |
|---------|----------------------|----------------------------------------------------|------------------------------|
| `POST`  | `/register`          | Inscription initiale ou acceptation d'invitation   | *Aucune*                     |
| `POST`  | `/login`             | Authentification email/mot de passe                | *Aucune*                     |
| `POST`  | `/refresh`           | Renouvellement de l'Access Token                   | `@UseGuards(JwtRefreshGuard)`|
| `POST`  | `/logout`            | Déconnexion de la session courante                 | `@UseGuards(JwtAuthGuard)`   |
| `POST`  | `/forgot-password`   | Demande de lien de réinitialisation                | *Aucune*                     |
| `POST`  | `/reset-password`    | Modification du mot de passe avec le token         | *Aucune*                     |
| `POST`  | `/invite`            | Création d'un lien d'invitation (collaborateur)    | `@UseGuards(JwtAuthGuard)`   |

## Configuration Globale

Le module nécessite les variables d'environnement suivantes dans votre fichier `.env` :

```env
# Sécurité JWT
JWT_SECRET="une_chaine_tres_secrete_pour_les_acces_tokens"
JWT_REFRESH_SECRET="une_autre_chaine_tres_secrete_longue_duree"
```

## Intégration dans le Reste de l'Application

Pour protéger vos autres routes (Dashboards, Nlq, Widgets), appliquez simplement le Guard `JwtAuthGuard`. 
Une fois appliqué, l'objet `req.user` (de Express) contiendra a minima `{ id: string, email: string }`.

**Exemple :**
```typescript
import { UseGuards, Controller, Get, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('dashboards')
export class DashboardsController {
  
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMesDashboards(@Req() req: Request) {
     const userId = req.user.id;
     // ... logique pour remonter les dashboards de cet utilisateur
  }
}
```

## Structure Interne

- `auth.module.ts` : Point d'entrée, configure Passport.js, JWTModule et importe le module Utilisateurs.
- `auth.service.ts` : Cœur de la logique métier (hachage, tokens, invitations).
- `auth.controller.ts` : Exposition des endpoints HTTP (décorateurs Swagger).
- `guards/`
  - `jwt-auth.guard.ts` : Protection standard. Vérifie le header Bearer Access Token.
  - `jwt-refresh-auth.guard.ts` : Protection pour la route `/refresh`. Rejette si refreshToken invalide/expiré.
- `strategies/`
  - `jwt.strategy.ts` : Stratégie de validation Access Token via JWT_SECRET.
  - `jwt-refresh.strategy.ts` : Stratégie de validation Refresh Token via JWT_REFRESH_SECRET.
- `dto/` : Définition des payloads d'entrée avec validations strictes (`class-validator`).

## Modèle Prisma (Rappel des changements)

Le fonctionnement s'appuie sur la table `User` et `Invitation`. Consultez `prisma/schema.prisma` :

```prisma
// Ajouts récents 
hashedRefreshToken   String?
resetPasswordToken   String?
resetPasswordExpires DateTime?

model Invitation {
  // Gère les invitations envoyées aux collaborateurs de l'organisation
}
```

## Guide de Test avec Postman

L'application tourne par défaut sur `http://localhost:3000`. Vous pouvez tester les endpoints d'authentification en suivant ces étapes (toutes les routes commencent par `/api/auth`) :

### 1. Inscription (Register)
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/register`
- **Body (raw JSON) :**
  ```json
  {
    "email": "test@example.com",
    "password": "password123",
    "organizationName": "Ma Super Entreprise",
    "firstName": "Jean",
    "lastName": "Dupont"
  }
  ```
- **Résultat attendu :** Un objet JSON contenant `accessToken` et `refreshToken`.

### 2. Connexion (Login)
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/login`
- **Body (raw JSON) :**
  ```json
  {
    "email": "test@example.com",
    "password": "password123"
  }
  ```
- **Résultat attendu :** Un objet JSON contenant `accessToken` et `refreshToken`. Copiez le `accessToken` pour l'utiliser dans l'étape suivante.

### 3. Utilisation de l'Access Token (ex: Logout ou Invite)
Pour tester une route protégée comme le `logout` ou `invite`, vous devez fournir l'Access Token :
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/invite`
- **Onglet "Authorization" dans Postman :**
  - Type : **Bearer Token**
  - Token : *Collez ici votre `accessToken` récupéré au login/register*
- **Body (raw JSON) :**
  ```json
  {
    "email": "collegue@example.com",
    "role": "controller",
    "organizationId": "<ID_DE_VOTRE_ORGANISATION>"
  }
  ```

### 4. Renouvellement de Token (Refresh)
L'Access Token expire après 15 minutes. Pour en obtenir un nouveau sans redemander le mot de passe :
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/refresh`
- **Onglet "Authorization" dans Postman :**
  - Type : **Bearer Token**
  - Token : *Collez ici votre `refreshToken` récupéré au login/register*
- **Résultat attendu :** Un **nouveau** couple `accessToken` et `refreshToken`. L'ancien refreshToken est invalidé et remplacé en base.

### 5. Mot de Passe Oublié (Forgot Password)
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/forgot-password`
- **Body (raw JSON) :**
  ```json
  {
    "email": "test@example.com"
  }
  ```
- **Résultat attendu :** Un message de succès. Dans la console du serveur, vous verrez un message `Reset token for ... : [LE_TOKEN_GÉNÉRÉ]`. Copiez ce jeton.

### 6. Réinitialisation du Mot de Passe (Reset Password)
- **Méthode :** `POST`
- **URL :** `http://localhost:3000/api/auth/reset-password`
- **Body (raw JSON) :**
  ```json
  {
    "token": "<LE_TOKEN_GÉNÉRÉ_A_LETAPE_PRECEDENTE>",
    "newPassword": "nouveauPassword456"
  }
  ```
- **Résultat attendu :** Message confirmant que le mot de passe a été modifié. Vous pouvez maintenant tester la route `login` avec le nouveau mot de passe.

