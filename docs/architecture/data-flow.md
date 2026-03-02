---
title: Flux de données
description: Comment la donnée voyage de Sage ERP jusqu'au dashboard Cockpit
---

# Flux de données

## Parcours complet de la donnée

```mermaid
graph TD
    subgraph Source["Source de données"]
        SAGE["🖥️ Sage ERP\nX3 / Sage 100\nSQL Server"]
    end

    subgraph Edge["Edge — On-Premise Client"]
        AGT["🤖 Agent\nsql_connector.py"]
        QUERY["Requêtes SQL\nSELECT only"]
        SAGE -->|"Connexion SQL locale"| QUERY
        QUERY -->|"Résultats bruts"| AGT
    end

    subgraph Transport["Transport Sécurisé"]
        HTTPS["HTTPS + TLS 1.3\nBearer token (30j)"]
        AGT -->|"Payload JSON"| HTTPS
    end

    subgraph Backend["InsightSage API (Cloud)"]
        direction TB
        REG["POST /agents/register\nValidation token"]
        HB["POST /agents/heartbeat\nStatus update"]
        SYNC["Sync endpoint\nUpsert données"]
        AUDIT_SVC["AuditLogService\n@Global, PII-safe"]

        HTTPS --> REG
        HTTPS --> HB
        HTTPS --> SYNC
        SYNC --> AUDIT_SVC
    end

    subgraph Storage["Stockage"]
        DB[("PostgreSQL\nSupabase")]
        SYNC -->|"Prisma upsert"| DB
        AUDIT_SVC -->|"INSERT audit_logs"| DB
    end

    subgraph Presentation["Présentation"]
        FRONT["Admin Cockpit\nReact Query"]
        DB -->|"REST JSON"| FRONT
    end
```

---

## Flux 1 : Onboarding d'un nouveau client

```mermaid
sequenceDiagram
    participant SA as SuperAdmin (Cockpit)
    participant API as InsightSage API
    participant DB as PostgreSQL
    participant ORG as Organisation Owner

    SA->>API: POST /admin/clients { orgName, adminEmail, ... }
    API->>DB: CREATE Organization + User (owner)
    API->>DB: INSERT AuditLog (organization_created)
    API-->>SA: { organizationId, resetToken }

    SA->>ORG: Envoie email avec lien reset password
    ORG->>API: POST /auth/reset-password { token, newPassword }
    API->>DB: UPDATE User.passwordHash
    API-->>ORG: 200 OK

    ORG->>API: POST /auth/login { email, password }
    API-->>ORG: { accessToken, refreshToken }

    Note over ORG,API: Démarrage du wizard d'onboarding (5 étapes)
    ORG->>API: POST /onboarding/step1 { plan }
    ORG->>API: POST /onboarding/step2 { name, sector, country }
    ORG->>API: POST /onboarding/step3 { sageType, sageMode, sageHost }
    ORG->>API: POST /onboarding/agent-link { agentToken }
    ORG->>API: POST /onboarding/step4 { profiles }
    ORG->>API: POST /onboarding/step5 { invitations[] }
    API->>DB: UPDATE OnboardingStatus.isComplete = true
```

---

## Flux 2 : Synchronisation agent → API

```mermaid
sequenceDiagram
    participant SAGE as Sage ERP (SQL Server)
    participant AGT as Agent (On-Premise)
    participant API as InsightSage API
    participant DB as PostgreSQL

    Note over AGT,API: Démarrage de l'agent
    AGT->>API: POST /agents/register { token, sage_type, version }
    API->>DB: UPDATE Agent.status = 'online'
    API-->>AGT: { syncConfig, orgId }

    loop Cycle de sync (configurable)
        AGT->>SAGE: SELECT TOP 1000 ... FROM dbo.VENTET ...
        SAGE-->>AGT: Lignes de données
        AGT->>API: POST /agents/sync { data[], checksum }
        API->>DB: UPSERT données métriques
        API-->>AGT: { syncedRows, nextSync }
    end

    loop Heartbeat (30 secondes)
        AGT->>API: POST /agents/heartbeat { token, status: 'online' }
        API->>DB: UPDATE Agent.lastSeen = NOW()
    end

    Note over API,DB: Cron interne: si lastSeen > 2min
    API->>DB: UPDATE Agent.status = 'offline'
```

---

## Flux 3 : Authentification et refresh de token

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant F as Admin Cockpit
    participant API as InsightSage API

    U->>F: Saisit email + password
    F->>API: POST /auth/login
    API-->>F: accessToken (15min) + refreshToken (7j)
    F->>F: localStorage.setItem(tokens)

    Note over F,API: Requête normale
    F->>API: GET /admin/users [Bearer accessToken]
    API-->>F: 200 OK

    Note over F,API: Token expiré (401)
    F->>API: GET /admin/stats [Bearer accessToken expiré]
    API-->>F: 401 Unauthorized

    Note over F: Axios interceptor déclenché
    F->>API: POST /auth/refresh [Bearer refreshToken]
    API->>API: Valide refreshToken + compare avec DB (bcrypt)
    API-->>F: new accessToken + new refreshToken

    F->>F: localStorage.setItem(new tokens)
    F->>API: Retry GET /admin/stats [Bearer new accessToken]
    API-->>F: 200 OK
```

---

## Flux 4 : Gestion du cycle de vie du token agent

```mermaid
stateDiagram-v2
    [*] --> pending : POST /agents/generate-token
    pending --> online : POST /agents/register
    online --> offline : Heartbeat absent > 2min
    offline --> online : POST /agents/register (reconnexion)
    online --> error : lastError != null
    error --> online : Heartbeat avec status: online
    online --> revoked : POST /agents/:id/revoke
    revoked --> pending : POST /agents/:id/regenerate-token
    pending --> expired : tokenExpiresAt atteint (30j)
    expired --> pending : POST /agents/:id/regenerate-token
```

---

## Flux 5 : Audit trail d'une action

```mermaid
flowchart LR
    A["Action utilisateur\n(ex: invite user)"] --> B["Controller\n(auth.controller.ts)"]
    B --> C["Service\n(auth.service.ts)"]
    C -->|"Logique métier"| D["Base de données\nPrisma"]
    C -->|"Injection @InjectService"| E["AuditLogService\n(Global)"]
    E -->|"sanitizePayload()"| F["Masquage PII\nEmail → j***@acme.com\nPassword → [REDACTED]"]
    F --> G["INSERT INTO audit_logs\n{ event, payload, userId, orgId }"]

    style E fill:#eab308,color:#000
    style F fill:#dc2626,color:#fff
```

### Exemple de payload avant/après sanitization

=== "Avant masquage"
    ```json
    {
      "email": "jean.dupont@acme.com",
      "password": "SecretPass123!",
      "role": "daf",
      "organizationId": "uuid-org-a"
    }
    ```

=== "Après sanitization"
    ```json
    {
      "email": "j***@acme.com",
      "password": "[REDACTED]",
      "role": "daf",
      "organizationId": "uuid-org-a"
    }
    ```

---

## Matrice des événements d'audit

| Domaine | Événements loggés |
|---------|-------------------|
| **Auth** | `user_login`, `user_logout`, `password_reset_requested`, `password_reset_completed` |
| **Users** | `user_created`, `user_updated`, `user_deleted`, `user_invited` |
| **Roles** | `role_created`, `role_updated`, `role_deleted` |
| **Agents** | `agent_registered`, `agent_token_generated`, `agent_token_regenerated`, `agent_token_revoked`, `agent_heartbeat`, `agent_error` |
| **Onboarding** | `onboarding_step_completed`, `onboarding_completed`, `agent_linked`, `users_invited_bulk`, `subscription_plan_selected` |
| **Organisations** | `organization_created`, `organization_updated`, `organization_deleted` |
| **Dashboards** | `dashboard_created`, `dashboard_updated`, `dashboard_deleted` |
| **Widgets** | `widget_added`, `widget_updated`, `widget_removed` |
| **NLQ** | `nlq_executed`, `nlq_saved_to_dashboard` |
| **Datasource** | `datasource_configured` |
