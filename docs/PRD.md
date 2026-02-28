# PRD.md – InsightSage MVP v1.1 (Nafaka SaaS BI)

*Product Requirements Document officiel pour le MVP back-end. Version 1.1 – 28/02/2026. Projet confidentiel Nafaka Tech.*

---

## 1. Executive Summary

**InsightSage est une plateforme SaaS BI B2B sécurisée basée sur une architecture Zero-Copy + Agent On-Premise.**
* Aucune donnée ERP n’est copiée dans le cloud
* Aucun credential ERP n’est stocké en SaaS
* Toutes les requêtes ERP passent par un Agent local sécurisé
* Communication outbound only (HTTPS 443)

**Problème résolu :** Les DAF perdent des heures en Excel/SQL pour obtenir CA, trésorerie, DMP – InsightSage donne réponse visuelle instantanée + export en toute sécurité (aucune donnée comptable n'est copiée sur le cloud).

**Vision :** Devenir le "cerveau décisionnel" des PME/ETI avec agents IA omnicanaux de manière 100% sécurisée et on-premise compatible.

---

## 2. Objectifs & KPIs Succès

| Objectif | Métrique | Cible MVP | Délai |
|----------|----------|-----------|-------|
| Adoption DAF | Utilisateurs actifs | 3x/semaine/pilote | Post-lancement |
| Performance | Time-to-Insight (TtI) | <30s pour 10 intents | MVP |
| Qualité données | Précision KPIs | <0.5% écart vs source | Tous KPIs |
| Stabilité | Heartbeat Agent | ≥99% online | Continu |
| Back-end | Uptime API | 99.9% | Production |

### 2.1 Architecture MVP Validée

```text
Frontend (DAF)
      ↓
Backend SaaS (Auth, NLQ, RBAC, Orchestration)
      ↓
Agent On-Premise (installé chez le client)
      ↓
ERP Sage (X3 / 100)
```

**Principes immuables :**
1. ❌ Aucun accès inbound vers le réseau client
2. ❌ Aucune base de données ERP copiée dans le cloud
3. ❌ Aucun credential Sage stocké côté SaaS
4. ✅ Agent initie toujours la connexion
5. ✅ Toutes les requêtes sont exécutées localement
6. ✅ Le backend ne manipule que du JSON métier

---

## 3. Personas & Priorités

### Persona Principal : DAF (Abdou)
- **Âge/Contexte :** 35-55 ans, PME/ETI, décisions quotidiennes, dépend DSI pour data
- **Jobs-to-be-Done :** "CA T-3 ?", "DMP clients >60j ?", "EBITDA approx"
- **Pain Points :** Excel manuel, délais DSI, multi-sources
- **KPIs critiques :** Revenue YoY/MoM, AR aging (30/60/90j), DMP

### Persona Secondaire : Admin Tech (Sokhna)
- **Mission :** Installer agent Sage → le lier à l'organisation → monitorer
- **Succès :** Agent installé <30min, heartbeat OK, logs lisibles

---

## 4. Agent On-Premise (Critique)

### 4.1 Rôle de l’Agent
L’Agent est responsable de :
* Stocker les credentials ERP localement
* Se connecter à Sage
* Exécuter les requêtes SQL validées
* Retourner les résultats en JSON
* Maintenir un heartbeat (status online/offline)

**⚠️ Le backend ne peut pas interroger Sage sans Agent actif.**

### 4.2 Agent Lifecycle
| État | Description |
|------|-------------|
| **Installed** | Agent installé localement |
| **Registered**| Agent lié à l'organization SaaS |
| **Online** | Heartbeat actif <60s |
| **Offline** | Aucun heartbeat >2min |
| **Error** | Erreur connexion ERP |

### 4.3 Heartbeat System
* **Endpoint backend :** `POST /agent/heartbeat`
* **Fréquence :** toutes les 30 secondes.

**Payload :**
```json
{
  "organizationId": "uuid",
  "agentVersion": "1.0.0",
  "status": "online",
  "lastSync": "timestamp"
}
```

---

## 5. Mode MVP = Query Direct (No DWH)

* Les KPIs sont recalculés à la demande
* Pas de base intermédiaire (DWH)
* Pas de nightly sync
* Cache possible 5–10 min max (Redis)

---

## 6. Contraintes Strictes Backend

Le backend :

✅ **Gère :**
* Auth & RBAC
* Isolation par Organisation
* NLQ parsing & Query validation
* Orchestration agent
* Audit logs

❌ **Ne gère pas :**
* Connexion ERP directe
* Stockage données comptables
* Credentials ERP

---

## 7. Features & Priorités (MoSCoW)

### Must-Have (P0 – MVP)
| Feature | Description | AC (Acceptance Criteria) |
|---------|-------------|-------------------------|
| **Onboarding** | Wizard : plan → orga → Agent → profils → invites | Terminable <15min, reprise possible |
| **Auth + RBAC** | OAuth2/JWT, rôles DAF/Admin, isolation tenant | Login <3s, guards 100% |
| **Cockpit DAF** | Pack 6 KPIs par défaut + drag&drop widgets | KPIs visibles au login |
| **Audit Logs** | Traçabilité actions/acces/NLQ | Exportable, filtrable (Admin only) |

### 7.1 Règles NLQ MVP
* Templates only (10 intents max)
* Regex validation `^SELECT`
* Hard limit `TOP 1000`
* Whitelist tables strictes
* Aucune requête dynamique libre
* Exécution exclusivement via Agent

---

## 8. User Flows Clés

### Flow 1 : Onboarding Complet DAF
```text
1. Étape 1 → Choix plan (Startup/PME/Business/Enterprise)
2. Étape 2 → Nom orga + secteur + taille (<50/50-500/>500)
3. Génération Agent Token (valide 30 jours)
4. Admin installe l’Agent localement
5. Agent démarre → s’authentifie via token
6. Test connexion Sage local
7. Validation OK → onboarding continue
↓
8. Étape 4 → Activer pack DAF (Revenue, DMP, AR aging...)
9. Étape 5 → Inviter équipe (DAF, Contrôleur) → "Terminé !"
↓
10. Login → Cockpit DAF prêt + status Agent "Online" visible
```
**⚠️ L’agent doit être ONLINE avant activation cockpit.**

### Flow 2 : NLQ → Widget
```text
1. DAF tape "CA janvier" → suggestions auto
2. Backend génère SQL Safe → envoie à l'Agent
3. Agent exécute en local → renvoie JSON
4. Résultat : graph + chiffre + SQL explainé
5. Clic "Ajouter au cockpit" → widget créé/persisté
6. Dashboard mis à jour en temps réel
```

---

## 9. API Contracts (Back-end → Front)

| Endpoint | Méthode | Payload Exemple | Response | Auth |
|----------|---------|----------------|----------|------|
| `/auth/login` | POST | `{email, password}` | `{access_token, refresh_token}` | None |
| `/onboarding/step1` | POST | `{plan: "business"}` | `{organizationId}` | JWT |
| `/dashboards/me` | GET | - | `{id, layout, widgets[]}` | JWT+DAF |
| `/nlq/query` | POST | `{query: "CA", context}` | `{metrics, vizType, sql}` | JWT |
| `/admin/agent-status` | GET | - | `{status: "online", lastSeen}` | Admin |

---

## 10. Non-Functional Requirements (Sécurité)

| Catégorie | Exigence | Description / Métrique |
|-----------|----------|------------------------|
| **Zero-Copy** | Données ERP | Aucune persistance ERP dans base SaaS |
| **Credentials** | ERP | Strictement stockés côté Agent uniquement |
| **Communication**| Network | HTTPS 443 outbound only |
| **Multi-tenant** | Isolation | `organizationId` obligatoire dans 100% des requêtes |
| **Performance** | NLQ response | <30s (95th percentile) |
| **Disponibilité**| API uptime | 99.9% mensuel |

---

## 11. Critères d'Acceptation (DoD)

### DAF Persona
- [ ] Login → Cockpit DAF avec pack 6 KPIs visibles
- [ ] "CA dernier trimestre" → graph <30s + "Ajouter cockpit" OK
- [ ] Export CSV KPIs → colonnes correctes, réconciliables <0.5%
- [ ] Drag&drop widgets → layout persisté

### Admin Persona
- [ ] Agent installé → health "OK" + logs visibles
- [ ] **Si Agent offline → Cockpit bloqué avec message clair**
- [ ] **Dashboard affiche statut agent visible (pastille verte/rouge)**
- [ ] **Reconnexion automatique si agent revient online**

### 11.1 KPIs Pack DAF (Précisions)
**Tous les KPIs doivent :**
* Être calculés côté ERP via Agent
* Être reproductibles manuellement via SQL
* Être documentés (formule + tables Sage)

**Liste :**
1. Revenue MoM : CA mois N / CA mois N-1
2. AR Aging 30j : Factures 0-30j / Total Factures
3. DMP : Âge moyen créances ouvertes
4. EBITDA/CA approx : (CA - Achats - Charges) / CA
5. Trésorerie nette : Banque + Crédits - Dettes
6. Top 5 clients risqués : DMP >60j + Montant

---

## 12. Roadmap & Planning

| Phase | Livrables | Durée | Paiement |
|-------|-----------|-------|----------|
| **Phase 1** | Architecture + stack validée | 6 jours | Acompte 40% OK |
| **Phase 2** | Auth + RBAC fonctionnels | 7 jours | - |
| **Phase 3** | APIs Cockpit + NLQ | 8 jours | 30% mi-parcours |
| **Phase 4** | Audit + Monitoring | 4 jours | - |
| **Phase 5** | Docs + Git + Bugfix 1 mois | 5 jours | 30% final |

**Total : 30 jours ouvrés** ✅

---

## 13. Vision Scalabilité (Post-MVP)

Future versions pourront inclure :
* Semantic layer
* Data warehouse optionnel (pour performances ou volumétrie massives)
* Alerting temps réel
* Multi-ERP connectors

*(NON inclus dans le MVP actuel).*