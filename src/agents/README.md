# Agents API - InsightSage Backend

## Overview

Ce module gère la communication entre le backend SaaS et les agents on-premise installés chez les clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND SAAS (NestJS)                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    AgentsModule                              │ │
│  │                                                              │ │
│  │  POST /api/agents/register     ← Agent s'enregistre         │ │
│  │  POST /api/agents/heartbeat    ← Heartbeat toutes les 30s   │ │
│  │  POST /api/agents/generate-token → Génère un token (Admin)  │ │
│  │  GET  /api/agents/status       → Status agent (DAF)         │ │
│  │  GET  /api/agents/:id          → Détails agent              │ │
│  │  POST /api/agents/:id/regenerate-token → Nouveau token      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (443)
                              │
┌─────────────────────────────┴─────────────────────────────────────┐
│                    AGENT ON-PREMISE (Python)                       │
│                                                                    │
│  • Stocke les credentials Sage localement                         │
│  • Exécute les requêtes SQL en lecture seule                      │
│  • Envoie heartbeat toutes les 30 secondes                        │
└────────────────────────────────────────────────────────────────────┘
```

## Endpoints

### 1. POST /api/agents/register (Public)

**Appelé par** : Agent on-premise au démarrage

**Body** :
```json
{
  "agent_token": "isag_abc123...",
  "sage_type": "100",
  "sage_version": "v12",
  "agent_name": "Agent-Production",
  "agent_version": "1.0.0"
}
```

**Réponse succès (200)** :
```json
{
  "success": true,
  "agent_id": "uuid-agent",
  "organization_id": "uuid-org",
  "organization_name": "ACME Corp",
  "message": "Agent registered successfully"
}
```

**Erreurs** :
- `404` : Token invalide

---

### 2. POST /api/agents/heartbeat (Public)

**Appelé par** : Agent on-premise toutes les 30 secondes

**Body** :
```json
{
  "agentToken": "isag_abc123...",
  "agentVersion": "1.0.0",
  "status": "online",
  "errorCount": 0,
  "lastError": null
}
```

**Réponse succès (200)** :
```json
{
  "success": true,
  "status": "online",
  "serverTime": "2026-01-15T10:30:00Z",
  "nextHeartbeat": 30
}
```

**Logique de status** :
- `online` : Agent fonctionnel
- `offline` : Pas de heartbeat depuis > 2 minutes
- `error` : Plus de 5 erreurs consécutives

---

### 3. POST /api/agents/generate-token (Protected)

**Permission requise** : `manage:agents`

**Rôles autorisés** : DAF, Owner

**Body** :
```json
{
  "name": "Agent-Production",
  "force": false
}
```

**Réponse succès (201)** :
```json
{
  "id": "uuid-agent",
  "token": "isag_abc123def456ghi789...",
  "name": "Agent-Production",
  "status": "pending",
  "message": "Token generated. Use this token in the agent configuration.",
  "instructions": {
    "step1": "Copy the token above",
    "step2": "Paste it in agent/config/config.yaml under backend.agent_token",
    "step3": "Start the agent: python -m src.main"
  }
}
```

---

### 4. GET /api/agents/status (Protected)

**Permission requise** : `read:agents`

**Réponse** :
```json
{
  "hasAgent": true,
  "agent": {
    "id": "uuid-agent",
    "name": "Agent-Production",
    "status": "online",
    "version": "1.0.0",
    "lastSeen": "2026-01-15T10:30:00Z",
    "lastSync": null,
    "rowsSynced": "0",
    "errorCount": 0,
    "lastError": null,
    "isStale": false
  },
  "totalAgents": 1
}
```

---

### 5. GET /api/agents/:id (Protected)

**Permission requise** : `read:agents`

Retourne les détails complets d'un agent (avec token masqué).

---

### 6. POST /api/agents/:id/regenerate-token (Protected)

**Permission requise** : `manage:agents`

Génère un nouveau token et invalide l'ancien. L'agent doit être reconfiguré.

---

### 7. POST /api/agents/:id/revoke (Protected)

**Permission requise** : `manage:agents`

Révoque immédiatement le token de l'agent. L'agent ne pourra plus se connecter jusqu'à ce qu'un nouveau token soit généré.

---

## Sécurité

### Token Format
```
isag_[48 caractères hexadécimaux]
```
Exemple : `isag_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4`

### Isolation Multi-Tenant
- Chaque agent est lié à une `organizationId`
- Les endpoints protégés vérifient que l'utilisateur appartient à la même organisation
- Les superadmins peuvent voir tous les agents

### Heartbeat Monitoring
- Un agent sans heartbeat depuis 2+ minutes est marqué `offline`
- Plus de 5 erreurs consécutives → status `error`
- Les erreurs sont loguées dans `AuditLog`

---

## Intégration avec l'Agent

L'agent on-premise doit :

1. **Au démarrage** : Appeler `POST /api/agents/register`
2. **Toutes les 30s** : Appeler `POST /api/agents/heartbeat`
3. **En cas d'erreur** : Inclure `errorCount` et `lastError` dans le heartbeat

Voir `/app/agent/README.md` pour la documentation complète de l'agent.
