---
title: Vue d'ensemble de l'Agent
description: L'agent — pont sécurisé entre Sage ERP et l'API InsightSage
---

# L'Agent — Pont Sécurisé

L'Agent est un processus léger déployé **on-premise** chez le client. Son rôle est d'établir un tunnel sécurisé et unidirectionnel entre le serveur Sage ERP du client et l'infrastructure cloud InsightSage.

## Principe de fonctionnement

```mermaid
graph LR
    subgraph Site Client ["🏢 Site Client (On-Premise)"]
        SAGE["🖥️ Sage ERP\nSQL Server\n(local network)"]
        AGT["🤖 Agent\nPython / Docker\nOutbound HTTPS uniquement"]
        SAGE -->|"SQL SELECT\n(localhost/LAN)"| AGT
    end

    subgraph Cloud ["☁️ Cloud (InsightSage)"]
        API["⚙️ InsightSage API\nHTTPS 443"]
    end

    AGT -->|"HTTPS + Bearer token\n→ Outbound only\n← Aucune connexion entrante"| API

    style SAGE fill:#1e293b,stroke:#475569
    style AGT fill:#0f3d3d,stroke:#0d9488,color:#2dd4bf
    style API fill:#0f172a,stroke:#0d9488
```

### Points clés de sécurité

| Aspect | Implémentation |
|--------|----------------|
| **Direction** | Outbound uniquement (Agent → API) — jamais entrant |
| **Protocole** | HTTPS/TLS 1.3 — chiffré de bout en bout |
| **Authentification** | Bearer token `isag_<64hex>` avec TTL 30 jours |
| **Révocation** | Instantanée via `POST /agents/:id/revoke` |
| **SQL** | `SELECT` uniquement — aucun accès en écriture sur Sage |
| **Réseau** | Seul le port 443 sortant est requis |

---

## Architecture interne de l'Agent

```mermaid
graph TD
    subgraph Agent["Agent (Python)"]
        MAIN["main.py\n(entrypoint)"]
        REG["register.py\nPOST /agents/register"]
        HB["heartbeat.py\nPOST /agents/heartbeat\n(toutes les 30s)"]
        SYNC["sync.py\nSELECT → POST /agents/sync"]
        SQL["sql_connector.py\npyodbc → SQL Server"]
        CONFIG["config.py\nENV vars + token"]
    end

    MAIN --> REG
    MAIN --> HB
    MAIN --> SYNC
    SYNC --> SQL
    REG --> CONFIG
    HB --> CONFIG
```

---

## Cycle de vie complet

### 1. Génération du token (Admin Cockpit)

```mermaid
sequenceDiagram
    participant SA as SuperAdmin / Owner
    participant COCKPIT as Admin Cockpit
    participant API as InsightSage API

    SA->>COCKPIT: Clique "Générer un token"
    COCKPIT->>API: POST /agents/generate-token { name: "agent-prod" }
    API-->>COCKPIT: { token: "isag_xxx...", expiresAt: "+30j" }
    COCKPIT-->>SA: Affiche token ⚠️ (une seule fois)
    SA->>SA: Copie le token → configure l'agent
```

!!! danger "Token à usage unique d'affichage"
    Le token est affiché **une seule fois** lors de la génération.
    Copiez-le immédiatement et configurez-le dans les variables d'environnement de l'agent.

### 2. Démarrage de l'agent

```mermaid
sequenceDiagram
    participant AGT as Agent
    participant API as InsightSage API
    participant DB as PostgreSQL

    AGT->>AGT: Charge AGENT_TOKEN depuis .env
    AGT->>API: POST /agents/register { token, sage_type, version }
    API->>DB: Cherche agent par token
    API->>DB: Vérifie isRevoked = false
    API->>DB: Vérifie tokenExpiresAt > NOW()
    API->>DB: UPDATE status = 'online', lastSeen = NOW()
    API-->>AGT: { orgId, syncConfig, agentId }
    AGT->>AGT: Démarre les boucles heartbeat + sync
```

### 3. Heartbeat (30 secondes)

```typescript
// Corps du heartbeat
POST /agents/heartbeat
{
  "agentToken": "isag_xxx...",
  "status": "online",    // "online" | "error"
  "errorCount": 0,
  "lastError": null
}
```

### 4. Détection d'agent hors ligne

```mermaid
graph LR
    HB["Heartbeat reçu\n→ lastSeen = NOW()"] --> CHECK
    CHECK{"lastSeen > 2 min ?"}
    CHECK -->|Non| ONLINE["status = online"]
    CHECK -->|Oui| OFFLINE["status = offline\n(Cron interne API)"]

    style ONLINE fill:#064e3b,stroke:#22c55e,color:#22c55e
    style OFFLINE fill:#1c1917,stroke:#78716c,color:#a8a29e
```

---

## États de l'agent

| État | Couleur | Condition |
|------|---------|-----------|
| `pending` | 🟡 Jaune | Token généré, agent jamais démarré |
| `online` | 🟢 Vert | Dernier heartbeat < 2 minutes |
| `offline` | ⚫ Gris | Dernier heartbeat > 2 minutes |
| `error` | 🔴 Rouge | Dernier heartbeat avec `status: error` |

---

## Gestion de l'expiration du token

L'API calcule les champs suivants pour chaque agent :

```typescript
const daysUntilExpiry = tokenExpiresAt
  ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / 86400000)
  : null;

const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;
```

!!! warning "Token expirant bientôt"
    Quand `isExpiringSoon = true`, le dashboard Admin Cockpit affiche une alerte.
    Procédez à une régénération via `POST /agents/:id/regenerate-token` avant l'expiration.

---

## Permissions SQL requises (Sage ERP)

L'agent se connecte à SQL Server avec un compte **limité en lecture** :

```sql
-- Créer un utilisateur dédié pour l'agent
CREATE LOGIN cockpit_agent WITH PASSWORD = 'StrongPassword123!';
CREATE USER cockpit_agent FOR LOGIN cockpit_agent;

-- Accorder SELECT sur les tables Sage
GRANT SELECT ON SCHEMA::dbo TO cockpit_agent;

-- OU plus granulaire (recommandé)
GRANT SELECT ON dbo.VENTET TO cockpit_agent;
GRANT SELECT ON dbo.BPCUSTOMER TO cockpit_agent;
GRANT SELECT ON dbo.ITMMASTER TO cockpit_agent;
```

!!! success "Principe du moindre privilège"
    L'agent ne nécessite **aucun** droit INSERT, UPDATE, DELETE ou DDL sur la base Sage.

---

## Métriques collectées par l'agent

| Métrique | Table Sage X3 | Description |
|----------|--------------|-------------|
| Chiffre d'affaires | `VENTET` | Lignes de vente |
| DSO / DMP | `BPCUSTOMER` + `VENTET` | Délai moyen de paiement |
| AR Aging | `GESBPC` | Balance âgée clients |
| Stock | `STOJOU` + `ITMMASTER` | Niveaux de stock |
| Commandes | `PORDER` | Pipeline commandes |
