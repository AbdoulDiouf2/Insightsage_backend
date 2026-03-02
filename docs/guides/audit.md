---
title: Audit & Conformité
description: Lire, filtrer et exporter les logs d'audit Cockpit
---

# Audit & Conformité

## Pourquoi les logs d'audit ?

Les logs d'audit Cockpit permettent de :

- **Traçabilité** : Qui a fait quoi et quand
- **Sécurité** : Détecter les accès suspects
- **Conformité** : Répondre aux exigences RGPD et réglementaires
- **Débogage** : Comprendre le comportement de la plateforme

---

## Consulter les logs

### Via Admin Cockpit

1. Menu → **Logs d'audit**
2. Utiliser les filtres :
   - **Type d'événement** : `user_login`, `agent_token_generated`, etc.
   - **Utilisateur** : Filtrer par userId
   - **Période** : Date de début et fin
   - **Limite** : 10 / 25 / 50 / 100 entrées

### Via API

```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.cockpit.nafaka.tech/api/logs/audit?event=user_login&limit=50"
```

Réponse :
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "user_login",
      "payload": { "email": "j***@acme.com" },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0...)",
      "createdAt": "2026-03-02T10:30:00.000Z",
      "user": { "id": "uuid", "firstName": "Jean", "lastName": "Dupont" },
      "organization": { "id": "uuid", "name": "Acme Corp" }
    }
  ],
  "meta": { "total": 1245, "limit": 50, "offset": 0, "hasMore": true }
}
```

---

## Filtres disponibles

| Paramètre | Type | Exemple | Description |
|-----------|------|---------|-------------|
| `event` | string | `user_login` | Type d'événement exact |
| `userId` | UUID | `uuid-user` | Actions d'un utilisateur spécifique |
| `startDate` | ISO 8601 | `2026-03-01T00:00:00Z` | Date de début |
| `endDate` | ISO 8601 | `2026-03-02T23:59:59Z` | Date de fin |
| `limit` | 1–100 | `25` | Entrées par page |
| `offset` | ≥ 0 | `50` | Pagination |

### Exemple — Logs des 24 dernières heures

```bash
START=$(date -u -d "yesterday" +"%Y-%m-%dT%H:%M:%SZ")
END=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

curl -H "Authorization: Bearer TOKEN" \
  "https://api.cockpit.nafaka.tech/api/logs/audit?startDate=$START&endDate=$END&limit=100"
```

---

## Distribution des événements

```bash
GET /logs/audit/events
```

Retourne le nombre d'occurrences par type d'événement :

```json
[
  { "event": "agent_heartbeat",       "count": 86400 },
  { "event": "user_login",            "count": 342 },
  { "event": "nlq_executed",          "count": 156 },
  { "event": "widget_added",          "count": 48 },
  { "event": "user_invited",          "count": 12 },
  { "event": "agent_token_generated", "count": 5 }
]
```

---

## Masquage PII dans les logs

!!! success "Protection automatique"
    Tous les logs sont **automatiquement sanitisés** avant insertion.
    Aucune donnée personnelle n'est stockée en clair.

| Donnée | Stockage en clair | Masquage appliqué |
|--------|:-----------------:|:-----------------:|
| Email | ❌ | `j***@acme.com` |
| Mot de passe | ❌ | `[REDACTED]` |
| Token/Secret | ❌ | `[REDACTED]` |
| IP Address | ✅ | Non masqué |
| Nom/Prénom | ✅ | Non masqué |
| ID utilisateur | ✅ | Non masqué |

---

## Exporter les logs (via API)

MkDocs ne fournit pas d'export natif — utilisez l'API et un script de collecte :

```bash
#!/bin/bash
# export-audit-logs.sh

TOKEN="votre_token"
BASE_URL="https://api.cockpit.nafaka.tech/api"
START="2026-03-01T00:00:00Z"
END="2026-03-31T23:59:59Z"
OUTPUT="audit-logs-mars-2026.jsonl"

OFFSET=0
LIMIT=100

while true; do
  RESP=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/logs/audit?startDate=$START&endDate=$END&limit=$LIMIT&offset=$OFFSET")

  # Écrire les données
  echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for log in data['data']:
    print(json.dumps(log))
" >> $OUTPUT

  # Vérifier hasMore
  HAS_MORE=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['meta']['hasMore'])")
  if [ "$HAS_MORE" = "False" ]; then break; fi

  OFFSET=$((OFFSET + LIMIT))
  echo "Fetched $OFFSET logs..."
done

echo "Export terminé : $OUTPUT"
```

---

## Alertes et surveillance

### Événements à surveiller activement

| Événement | Fréquence suspecte | Action |
|-----------|-------------------|--------|
| `user_login` | > 20 tentatives/min | Possible attaque brute force |
| `agent_error` | errorCount croissant | Problème SQL Sage |
| `agent_token_revoked` | Inattendu | Vérifier qui a révoqué |
| `organization_deleted` | Inattendu | Action destructive |
| `user_deleted` | Hors procédure | Vérifier la conformité |

### Cas d'usage RGPD

Pour répondre à une demande de droit à l'oubli :

```bash
# 1. Identifier tous les logs d'un utilisateur
GET /logs/audit?userId=UUID_USER&limit=100

# 2. Supprimer l'utilisateur (les logs conservent userId = null)
DELETE /admin/users/UUID_USER

# 3. Vérifier en DB que les logs sont anonymisés
SELECT * FROM audit_logs WHERE user_id IS NULL AND created_at > '2026-01-01';
```

!!! note "Politique de rétention"
    Par défaut, les logs sont conservés **indéfiniment**. Pour une purge réglementaire :
    ```sql
    -- Purger les logs de plus de 2 ans
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years';
    ```

---

## Permissions requises

| Action | Permission |
|--------|-----------|
| Consulter les logs de son org | `read:logs` |
| Consulter les logs cross-tenant | `manage:all` (SuperAdmin) |
| Purger des logs | Accès DB direct uniquement |
