---
title: Cockpit — Documentation
description: Bienvenue dans la documentation officielle de la plateforme Cockpit
---

<div class="cockpit-hero">
  <h1>Cockpit Platform</h1>
  <p>
    Documentation officielle de la plateforme d'administration Cockpit —
    un écosystème complet conçu pour les entreprises qui exploitent <strong>Sage ERP</strong>
    et souhaitent centraliser la gestion de leurs données, utilisateurs et organisations.
  </p>
</div>

<div class="cockpit-stats">
  <div class="cockpit-stat"><strong>Multi-tenant</strong><span>Architecture stricte</span></div>
  <div class="cockpit-stat"><strong>RBAC</strong><span>5 rôles système</span></div>
  <div class="cockpit-stat"><strong>JWT</strong><span>Access + Refresh tokens</span></div>
  <div class="cockpit-stat"><strong>4 plans</strong><span>Startup → Enterprise</span></div>
  <div class="cockpit-stat"><strong>99.9%</strong><span>Disponibilité cible</span></div>
</div>

## Vue d'ensemble

La plateforme **Cockpit** est composée de trois éléments interconnectés :

```mermaid
graph LR
    A["🖥️ Sage ERP\n(On-Premise)"] -->|SQL queries| B["🤖 Agent\n(Python / Docker)"]
    B -->|HTTPS + Token| C["⚙️ InsightSage API\n(NestJS / PostgreSQL)"]
    C -->|REST JSON| D["🎛️ Admin Cockpit\n(React / Vite)"]

    style A fill:#1e293b,stroke:#475569,color:#94a3b8
    style B fill:#0f3d3d,stroke:#0d9488,color:#2dd4bf
    style C fill:#1e293b,stroke:#0d9488,color:#2dd4bf
    style D fill:#0f3d3d,stroke:#475569,color:#94a3b8
```

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **InsightSage API** | NestJS + Prisma + PostgreSQL | Backend central multi-tenant |
| **Admin Cockpit** | React + Vite + Tailwind | Interface d'administration SuperAdmin |
| **Agent** | Python / Docker | Pont sécurisé vers Sage ERP |

## Sections de la documentation

<div class="cockpit-grid">
  <a href="getting-started/" class="cockpit-card">
    <h3>🚀 Démarrage rapide</h3>
    <p>Installer et lancer la plateforme en moins de 10 minutes. Prérequis, variables d'environnement, premier login.</p>
  </a>
  <a href="architecture/overview/" class="cockpit-card">
    <h3>🏗️ Architecture</h3>
    <p>Schéma haut-niveau, flux de données, stack technique complète et choix d'architecture.</p>
  </a>
  <a href="backend/setup/" class="cockpit-card">
    <h3>⚙️ Backend API</h3>
    <p>Installation, configuration, référence complète des endpoints, modules et sécurité.</p>
  </a>
  <a href="frontend/architecture/" class="cockpit-card">
    <h3>🎛️ Admin Cockpit</h3>
    <p>Architecture frontend, design system, gestion d'état, pages et navigation.</p>
  </a>
  <a href="agent/overview/" class="cockpit-card">
    <h3>🤖 L'Agent</h3>
    <p>Pont sécurisé entre Sage ERP et l'API. Installation, configuration et dépannage.</p>
  </a>
  <a href="guides/organizations/" class="cockpit-card">
    <h3>📖 Guides Fonctionnels</h3>
    <p>Guides pas-à-pas pour les opérations admin courantes : organisations, utilisateurs, abonnements.</p>
  </a>
  <a href="developer/standards/" class="cockpit-card">
    <h3>🛠️ Développeur & DevOps</h3>
    <p>Standards de code, suite de tests, déploiement Docker et pipelines CI/CD.</p>
  </a>
  <a href="backend/security/" class="cockpit-card">
    <h3>🔐 Sécurité</h3>
    <p>JWT, RBAC granulaire, isolation multi-tenant, masquage PII et conformité.</p>
  </a>
</div>

## Modèle de sécurité en un coup d'œil

```mermaid
sequenceDiagram
    participant C as Client HTTP
    participant J as JwtAuthGuard
    participant T as TenantGuard
    participant P as PermissionsGuard
    participant S as Service

    C->>J: Request + Bearer token
    J-->>J: Valide JWT (expiry, signature)
    J->>T: User authentifié
    T-->>T: Vérifie organizationId
    T->>P: Tenant isolé
    P-->>P: Vérifie action:resource
    P->>S: Autorisé ✓
    S-->>C: Response 200
```

!!! info "Environnements supportés"
    - **Développement** : `.env.dev` — Hot reload avec `npm run start:dev`
    - **Test** : `.env.test` — Jest avec base de données isolée
    - **Production** : `.env.prod` — Node.js `dist/main.js`

## Prérequis rapides

| Outil | Version minimale | Rôle |
|-------|-----------------|------|
| Node.js | 20.x LTS | Runtime backend & frontend |
| npm | 10.x | Gestionnaire de paquets |
| PostgreSQL | 14+ | Base de données (via Supabase) |
| Git | 2.x | Versionnement |

---

!!! tip "Vous êtes développeur ?"
    Commencez par la section [Démarrage rapide](getting-started.md) puis consultez la
    [Référence API](backend/api-reference.md) et les [Standards de développement](developer/standards.md).

!!! tip "Vous êtes administrateur ?"
    Consultez les [Guides Fonctionnels](guides/organizations.md) pour les opérations quotidiennes.
