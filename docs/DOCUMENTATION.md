# Documentation Technique & Fonctionnelle : Teranga Insight CFO

**Date de création / Mise à jour :** Février 2026
**Cible :** Direction Financière (CFO), Équipe de Développement
**Environnement :** Front-end Modern React

---

## 1. Vue d'Ensemble du Projet

*Teranga Insight CFO* est une application web d'aide à la décision (OAD) conçue pour les Directeurs Financiers (CFO). Elle agit comme un tableau de bord (Cockpit) centralisé offrant une vue analytique à 360 degrés sur la santé financière, la trésorerie et les revenus d'une entreprise.
Elle allie une approche métier pointue (suivi de trésorerie, DSO, cascade de revenus) à des technologies front-end modernes, réactives et visuelles. De plus, elle intègre une interface de requête en langage naturel (IA).

---

## 2. Architecture Fonctionnelle (Ce que fait l'application)

L'application est découpée en quatre grands pôles métiers majeurs, modélisés sous forme de tableaux de bord (Dashboards).

### A. Le Cockpit Exécutif (CFO Executive Cockpit)
La "Tour de Contrôle". Espace de résumé et d'alerte.
*   **Fonctionnalité :** Vue condensée des indicateurs principaux.
*   **Indicateurs (KPIs) :** Chiffre d'Affaires global, Flux de trésorerie (Cash Flow), Délai de Recouvrement Moyen (DSO), Marge brute.
*   **Visualisation :** Évolution des revenus mensuels (CA, Profit, Marge), Tableaux des tops clients, et alertes stratégiques.
*   **Interaction :** Filtres de périodes, sélecteurs de devise, module de widgets personnalisables.

### B. Suivi de Trésorerie (Cash Flow Monitoring)
Gestion en temps réel des liquidités et du risque client.
*   **Fonctionnalité :** Suivi granulaire des encaissements et décaissements.
*   **Indicateurs (KPIs) :** Trésorerie actuelle (Cash Position), Projections, Montant des créances en retard.
*   **Analyse "Aging" :** Répartition des factures impayées par tranches d'ancienneté (0-30j, 31-60j, +90j).
*   **Risque Client :** Identification des clients avec retards de paiement, encours et limite de crédit (Risk Score).
*   **Actions :** Raccourcis pour déclencher des actions de relance ou de recouvrement.

### C. Analyse des Revenus (Revenue Analytics)
Analyse en profondeur de la performance commerciale.
*   **Fonctionnalité :** Découpe des sources de revenus et analyse de croissance.
*   **Indicateurs (KPIs) :** CA Total, Taux de croissance (MoM/YoY), Taille moyenne des affaires (Deal Size), Taux de conversion.
*   **Visualisation "Waterfall" :** Un graphique en cascade expliquant la variation des revenus (Revenus N-1 + Nouveaux Clients + Upselling - Churn = Revenus Actuels).
*   **Analyse Sectorielle :** Tops produits et Tops clients par contribution au revenu.
*   **Export :** Génération de rapports (Excel, PowerPoint) simulée.

### D. Assistant IA (Natural Language Query Interface)
Interrogation intelligente des données.
*   **Fonctionnalité :** Interface de dialogue pour générer des rapports à la volée.
*   **Interaction :** Saisie de requêtes textuelles ou vocales (ex: "Quel est le chiffre d'affaires ce mois-ci ?").
*   **Génération :** Traduction stricte de la requête en SQL *Safe* via le Back-end, transmise à l'**Agent On-Premise** pour interrogation directe et sécurisée (lecture seule) de l'ERP Sage en temps réel.
*   **Historique :** Suivi et gestion des requêtes passées ("Insights" personnalisés).

---

## 3. Architecture Technique (Comment l'application est construite)

L'application est une Single Page Application (SPA) développée exclusivement en JavaScript/React.

### Stack Technologique Principal
*   **Noyau :** React 18, React DOM (Hooks natifs très utilisés `useState`, `useEffect`).
*   **Build Tool / Serveur local :** Vite (remplace Create React App, ultrarapide, configuré avec `vite-tsconfig-paths`).
*   **Routage :** React Router v6 (Déclaratif via `<BrowserRouter>` et `<Routes>`).
*   **Stylisation & CSS :** Tailwind CSS v3.4 (utilitaire-first), complété par des plugins puissants (`@tailwindcss/forms`, `@tailwindcss/typography`).
*   **Manipulation de classes :** `clsx` et `tailwind-merge` (souvent condensés via l'utilitaire interne `./utils/cn.js`).

### Librairies Avancées & UI
*   **Composants graphiques métiers (Charts) :** `recharts` (très exploité pour le Waterfall, les line/bar charts) et `d3.js` en support potentiel.
*   **Animations :** `framer-motion` et `tailwindcss-animate` (fluidité de l'interface, loaders, transitions modales).
*   **Gestion de Formulaires :** `react-hook-form` (pour les filtres et recherche).
*   **Traitement de l'information :** `date-fns` (manipulation des dates), `axios` (prêt pour de futures requêtes HTTP réelles).
*   **Gestion d'État Global :** Redux / Redux Toolkit (installés mais l'architecture actuelle repose massivement sur des "states" locaux par vue).

### Structure Typique (Le dossier `/src`)
*   `App.jsx` & `index.jsx` : Point d'entrée de l'application.
*   `Routes.jsx` : Fichier de mapping des URL vers les composants Pages.
*   `components/` : 
    *   Composants transverses : `ErrorBoundary.jsx`, `ScrollToTop.jsx`, `AppIcon.jsx` (Basé sur la librairie `lucide-react`).
    *   `ui/` : Un Design System atomique propre au projet (`Button`, `Input`, `Select`, `Checkbox`, `NavigationBreadcrumb`).
*   `pages/` : Le cœur de l'application logique. Chaque tableau de bord a son propre dossier contenant sa vue principale (`index.jsx`) et ses sous-composants dédiés.
    *   `/cash-flow-monitoring-dashboard/` -> `CashFlowChart`, `CustomerRiskAssessment`, etc.
    *   `/cfo-executive-cockpit-dashboard/` -> `KPICard`, `AlertsPanel`, `WidgetLibrary`, etc.
    *   `/natural-language-query-interface/` -> `QueryProcessor`, `QueryInput`, etc.
    *   `/revenue-analytics-dashboard/` -> `RevenueWaterfall`, `TopPerformersPanel`, etc.
*   `utils/cn.js` : Fonction utilitaire vitale pour concaténer proprement les classes Tailwind dynamiques.

---

## 4. État Actuel du Projet & Remarques Techniques

*   **Données ("Mocking") :** Actuellement, le front-end fonctionne avec des données métiers simulées en dur. À terme, les données réelles (Sage SQL Server) proviendront de JSON générés localement chez le client via un **Agent On-Premise**, garantissant une architecture "Zero-Copy" sécurisée côté Back-end.
*   **Simulateurs :** Le Dashboard de requêtes naturelles (IA) inclut un moteur local simulant avec des timers le traitement sémantique de la question, la vérification, et la réponse graphique avant de l'afficher. 
*   **Outils Tiers :** La présence de la librairie `@dhiwise/component-tagger` indique que la maquette initiale a probablement utilisé le générateur DhiWise comme accélérateur de code.
*   **Qualité du Code :** Le code est propre, orienté composant, avec une séparation claire entre les atomes génériques (`/components/ui`) et les blocs complexes métiers (`/pages/.../components`).

---

## 5. Démarrage et Cycle de Développement

*   **Prérequis :** Node.js (v14+ conseillé)
*   **Installation dépendances :** `npm install` (ou `yarn install`)
*   **Start (Serveur de Dév Vite) :** `npm run start` (le navigateur ouvrira automatiquement l'application avec Hot Reload actif).
*   **Build (Production) :** `npm run build` (générera le dossier de production optimisé via Vite).
