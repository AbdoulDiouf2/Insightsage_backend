# InsightSage (Backend API)

Bienvenue sur le dépôt du backend API d’**InsightSage**, une plateforme SaaS unifiée d’analyse de données conçue pour les PME, permettant l'interrogation en langage naturel et la génération dynamique de tableaux de bord avancés à partir de données ERP (Sage).

## 🚀 Fonctionnalités principales

*   **Multi-Tenancy Strict** : Architecture SaaS permettant d'isoler hermétiquement les données, utilisateurs et abonnements de plusieurs organisations.
*   **Contrôle d'Accès (RBAC Dynamique)** : Gestion granulaire des rôles et permissions (DAF, DG, Admin, Analyste) bloquant/autorisant l'accès aux ressources via une matrice de permissions.
*   **Agents On-Premise (Data Syncer)** : Interface sécurisée pour la communication HTTPS unidirectionnelle avec les agents locaux Sage des clients, sans ouverture de ports entrants.
*   **Tableaux de Bord & Widgets** : Moteur de personnalisation des cockpits CFO/DAF avec des packs de KPIs et un Widget Store.
*   **Connexion & Sécurité** : Authentification par JWT (Access/Refresh tokens), sécurisation des payloads et audit log complet des actions sensibles.
*   **Interface NLQ** : Moteur permettant d'interpréter des requêtes utilisateur en langage naturel vers des requêtes SQL ultra-sécurisées (`SELECT` only, templates validés).

## 🛠️ Stack Technique

*   **Framework** : [NestJS](https://nestjs.com/) v11 (Node.js/TypeScript)
*   **Base de Données** : PostgreSQL via [Prisma ORM](https://www.prisma.io/) v7
*   **Authentification** : JWT (JSON Web Tokens) & Bcrypt (hachage des mots de passe)
*   **Langage** : TypeScript au standard ECMAScript strict

## 📂 Architecture & Modules (`src/`)

L'application est découpée en modules métier (Domain-Driven Design), chacun disposant de son propre `README.md` détaillé :

*   **`admin`** : Point d'entrée exclusif pour l'équipe InsightSage (SuperAdmin) pour créer les clients (onboarding initial) et superviser le système.
*   **`admin-panel`** : Interface d'administration visuelle (AdminJS / Prisma Studio).
*   **`agents`** : Gestion des tokens d'agents on-premise, heartbeat, monitoring des statuts et révocations.
*   **`auth`** : Authentification globale, JWT, Reset de mot de passe, et système d'invitations.
*   **`dashboards`** : Gestion personnalisée des cockpits et des vues par profil.
*   **`health`** : Endpoints vitaux de monitoring et de disponibilité système.
*   **`logs`** : Centralisation et restitution paginée des journaux d'audit (Audit Logs).
*   **`nlq`** : Traitement des requêtes en langage naturel (Natural Language Querying).
*   **`onboarding`** : Tunnel de configuration d'un compte Wizard à 5 étapes (Plans, Profils, Sage, KPIs, Invites) adossé à une machine à états en base de données.
*   **`organizations`** : Paramètres et cycle de vie d'un espace client (Tenant).
*   **`prisma`** : Configuration centralisée de l'accès à la base de données.
*   **`roles`** : Création et gestion des rôles sur-mesure et matrice de permissions.
*   **`subscriptions`** : Gestion dynamique et persistante des abonnements en base de données (Startup, PME, Enterprise).
*   **`users`** : Profil personnel et administration de son équipe (DAF).
*   **`widgets`** : Bibliothèque de composants analytiques (Widget Store, KPI Packs).

## ⚙️ Variables d'Environnement

L'application requiert plusieurs variables d'environnement. Copiez le modèle existant vers votre environnement cible :

```bash
# Pour le développement local (à créer)
cp .env.example .env.dev
```

Le module Config lira en priorité `.env.dev`, `.env.test`, ou `.env.prod` selon `NODE_ENV`. *(Ne commitez jamais de vrais secrets dans `.env`).*

## 💻 Installation & Développement

Assurez-vous d'avoir installé **Node.js** (v20+) et une base de données **PostgreSQL**.

### 1️⃣ Installation des dépendances

```bash
npm install
```

### 2️⃣ Initialisation de la Base de Données

Générez les définitions de types Prisma et déployez les tables vers votre base :

```bash
# Générer le client Prisma TypeScript
npx prisma generate

# Pousser les modifications du schéma vers la base de données (Développement)
npx prisma db push
```

*Note : Pour la production, préférez `npx prisma migrate deploy`.*

### 3️⃣ Lancement du serveur

Pour instancier l'API en développement (Mode Watch) sur le port défini par votre `.env.dev` (ex: `http://localhost:3000`) :

```bash
npm run start:dev
```

Pour compiler et lancer le build final :

```bash
npm run build
npm run start:prod
```

## 🔐 Licences & Maintien

Ce projet est la propriété stricte du projet **InsightSage**. `UNLICENSED` par défaut.

---
**Mainteneur :** Équipe InsightSage.
