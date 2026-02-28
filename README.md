# InsightSage (Backend API)

Bienvenue sur le dépôt du backend API d’**InsightSage**, une plateforme SaaS unifiée d’analyse de données conçue pour les PME, permettant l'interrogation en langage naturel et la génération dynamique de tableaux de bord avancés.

## 🚀 Fonctionnalités principales

*   **Multi-Tenancy** : Architecture SaaS permettant d'isoler les données et abonnements de plusieurs organisations.
*   **Contrôle d'Accès (RBAC)** : Gestion des rôles dynamique (DAF, DG, Admin, etc.) pour interdire/autoriser l'accès aux ressources.
*   **Tableaux de Bord Dynamiques** : Stockage du layout personnalisé des KPIs par profil et par organisation.
*   **Prisma ORM** : Gestion de la base de données PostgreSQL avec `adapter-pg` et schémas optimisés pour le scaling.
*   **Agent Data Syncer (Prévu)** : Interface d'API prévue pour la communication avec des agents on-premise.
*   **NLQ Metrics (Prévu)** : Recherche d'intentions utilisateurs avec retour formaté en SQL / données.

## 🛠️ Stack Technique

*   **Framework** : [NestJS](https://nestjs.com/) v11 (Node.js/TypeScript)
*   **Base de Données** : PostgreSQL via [Prisma ORM](https://www.prisma.io/) v7
*   **Driver DB** : `@prisma/adapter-pg` (Obligatoire sur Prisma 7+) & `pg`
*   **Authentification** : Prévue avec Passport-JWT / Bcrypt
*   **Langage** : TypeScript au standard ECMAScript (Configuration strict + `NodeNext`)

## 📂 Structure des Dossiers

Voici un bref aperçu de l'organisation interne du code :

```text
insightsage_backend/
├── prisma/             # Fichiers Prisma (schéma de base de données, migrations)
├── src/                # Code source principal de l'application NestJS
│   ├── app.module.ts   # Module racine de l'application
│   ├── main.ts         # Point d'entrée de l'application
│   └── prisma/         # Module NestJS global pour l'accès aux services Prisma
├── test/               # Configuration et scripts pour les tests de bout en bout (e2e)
├── .env.example        # Modèle de variables d'environnement à pousser sur Git
├── .env.dev            # Variables d'environnement pour le développement local
├── .env.test           # Variables d'environnement pour l'environnement de test
├── .env.prod           # Variables d'environnement pour la production
└── package.json        # Dépendances et scripts NPM
```

## ⚙️ Variables d'Environnement

L'application requiert plusieurs variables d'environnement. Copiez le modèle existant vers votre environnement cible selon vos besoins :

```bash
# Pour le développement local (à créer)
cp .env.example .env.dev
```

Le module Config de NestJS ira lire en priorité `.env.dev`, `.env.test`, ou `.env.prod` selon la valeur assignée à la variable `NODE_ENV`.
**(Note : Ne jamais commiter de vrais secrets dans `.env`, `.env.dev`, ou autre environnement réel, utilisez les `.env.example`).**

## 💻 Installation & Développement

Assurez-vous d'avoir installé **Node.js** (v20+ conseillé) et une base de données **PostgreSQL**.

### 1️⃣ Installation des dépendances

```bash
npm install
```

### 2️⃣ Initialisation de la Base de Données

Générez les définitions de types Prisma et déployez les tables vers votre base de données locale (indiquée dans `.env.dev` ou `.env`) :

```bash
# Générer le client Prisma TypeScript
npx prisma generate

# Pousser les modifications du schéma vers la base de données
npx prisma db push
```

*Note : Pour la production, préférez `npx prisma migrate deploy`.*

### 3️⃣ Lancement du serveur

Pour instancier l'API en développement (Mode Watch) sur le port défini par votre `# PORT` dans `.env.dev` (ex: `http://localhost:3000`) :

```bash
npm run start:dev
```

Pour compiler et vérifier le build final :

```bash
npm run build
npm run start:prod
```

## 🔐 Licences & Maintien

Ce projet est la propriété stricte du projet **InsightSage**. `UNLICENSED` par défaut.

---
**Mainteneur :** Équipe InsightSage.
