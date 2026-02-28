# 📘 DOCUMENT OFFICIEL – Mission Data Engineer

## Projet : InsightSage – Agent ERP sécurisé (Sage)

---

## 1️⃣ Contexte & Objectif Global

**InsightSage** est une plateforme SaaS B2B permettant aux DAF/CFO d’interroger leur ERP Sage en langage naturel et d’obtenir des indicateurs financiers en temps réel.

**Contraintes critiques :**
* Les données Sage **restent chez le client** (on-premise).
* Le SaaS ne doit **jamais** stocker de credentials ERP.
* Le SaaS ne doit **jamais** se connecter directement à Sage.
* Toute connexion doit être **initiée depuis le réseau client** vers le cloud (connexion sortante uniquement).

> 🎯 **Ton rôle** est de construire le pont sécurisé entre Sage et notre backend SaaS. Ce pont s’appelle : **InsightSage Agent**.

---

## 2️⃣ Vision Architecture Cible

**Architecture finale :**  
`DAF` → `Frontend SaaS` → `Backend SaaS` → `Agent On-Prem` → `Sage SQL Server`

**Règles fondamentales :**
- Le Backend ne touche **jamais** à la base Sage.
- L’Agent est installé **chez le client**.
- L’Agent garde les credentials localement.
- L’Agent exécute uniquement des requêtes en lecture (`SELECT`).
- L’Agent renvoie uniquement du JSON.

---

## 3️⃣ Ce que tu dois construire

### 🎯 Mission principale

Créer un **Agent On-Premise sécurisé** qui :
1. Se connecte à Sage (SQL Server).
2. Reçoit des requêtes SQL depuis le Backend SaaS.
3. Exécute ces requêtes en **lecture seule**.
4. Retourne les résultats en JSON.
5. Applique des **règles strictes de sécurité**.
6. Fonctionne comme un **service système autonome**.

---

## 4️⃣ Spécifications Fonctionnelles

### 4.1 Agent On-Premise

**Objectif :** Créer un exécutable installable chez le client (Windows en priorité).

**Exigences :**
- Doit être installable en moins de 5 minutes.
- Doit fonctionner comme un service système (Windows Service).
- Démarrage automatique au boot.
- Invisible pour le DAF.
- Pas besoin d’être lancé manuellement.

**Stack recommandée :**
- Python
- `pyodbc`
- FastAPI (serveur minimal interne)
- PyInstaller (génération `.exe`)
- Docker pour environnement dev

### 4.2 Connexion Sage

**Compatible avec :**
- Sage 100
- Sage X3
- Base SQL Server

**Configuration locale (pendant l’installation) :**  
L’Agent doit demander :
- Host SQL Server
- Nom de la base
- Login read-only
- Mot de passe

> ⚠️ **Attention :** Ces informations sont stockées **localement uniquement** (jamais envoyées au SaaS).

### 4.3 Communication SaaS ↔ Agent

**Modèle de communication :**
- Connexion HTTPS sortante uniquement.
- L’Agent initie la communication.
- Aucun port entrant ouvert chez le client.

### 4.4 Enregistrement de l’Agent

**Endpoint SaaS :** `POST /agents/register`

**Payload envoyé par l’Agent :**
```json
{
  "agent_token": "...",
  "sage_type": "X3",
  "sage_version": "v12"
}
```

**Réponse SaaS :**
```json
{
  "organization_id": "...",
  "whitelist_tables": ["factures", "clients", "comptes"]
}
```
*L’Agent stocke le token localement.*

### 4.5 Exécution des requêtes

**Endpoint interne Agent :** `POST /execute_sql`

**Input :**
```json
{
  "sql_query": "...",
  "params": {}
}
```

**L’Agent doit :**
1. Vérifier que la requête commence par `SELECT`.
2. Refuser toute requête contenant : `UPDATE`, `DELETE`, `INSERT`, `DROP`, `ALTER`.
3. Ajouter automatiquement `TOP 1000` si absent.
4. Vérifier que les tables utilisées sont dans la whitelist.
5. Exécuter via `pyodbc`.
6. Retourner uniquement du JSON.

**Output :**
```json
{
  "result": [...],
  "metadata": {
    "rows": 245,
    "exec_time_ms": 180
  }
}
```

---

## 5️⃣ Sécurité (CRITIQUE)

Tu es responsable de la sécurité data côté client.

**Obligations :**
- [x] Lecture seule uniquement.
- [x] Whitelist tables stricte (max 10 tables).
- [x] Limitation 1000 lignes par requête.
- [x] Rate limit : 10 requêtes / minute.
- [x] Logs d’erreurs clairs.
- [x] Masquage des PII si nécessaire.
- [x] Timeout max requête : 5 secondes.

---

## 6️⃣ Monitoring & Santé Agent

**L’Agent doit :**
- Envoyer un heartbeat toutes les 30 secondes.
- Mettre à jour `last_seen`.
- Reporter les erreurs.
- Exposer un endpoint local `/ping`.

**Le Backend SaaS doit pouvoir appeler :**  
`GET /admin/agent-status/{org_id}`

---

## 7️⃣ Livrables Attendus

### Semaine 1
- [ ] Agent exécutable Windows.
- [ ] Connexion Sage fonctionnelle.
- [ ] Endpoint `execute_sql` sécurisé.
- [ ] Service système opérationnel.

### Semaine 2
- [ ] Whitelist tables implémentée.
- [ ] SQL sandbox validée.
- [ ] Rate limiting actif.
- [ ] Heartbeat actif.
- [ ] Gestion logs erreurs.

### Semaine 3
- [ ] Dataset anonymisé 10 000 lignes.
- [ ] Tests de performance.
- [ ] Documentation installation client.
- [ ] Documentation technique architecture.
- [ ] Procédure de mise à jour agent.

---

## 8️⃣ Ce que tu ne dois PAS faire

- ❌ Ne **jamais** stocker de credentials ERP dans le SaaS.
- ❌ Ne **jamais** autoriser de requêtes d’écriture.
- ❌ Ne **jamais** ouvrir de port entrant.
- ❌ Ne **jamais** exécuter de SQL non validé.

---

## 9️⃣ Critères d’Acceptation

- [x] Installation en < 5 minutes.
- [x] DAF peut interroger “CA Q1” → résultat < 3 secondes.
- [x] Aucune donnée copiée vers le SaaS.
- [x] Logs clairs en cas d’erreur.
- [x] Agent stable après redémarrage machine.
- [x] Service auto-start.
- [x] Aucune faille SQL injection possible.

---

## 🔟 Impact Business de ton Travail

**Si tu réussis :**
* ✅ Produit vendable à des PME / ETI.
* ✅ Acceptable par une DSI.
* ✅ Sécurisé by design.
* ✅ Scalabilité multi-clients.
* ✅ Architecture Enterprise crédible.

**Si tu échoues :**
* ❌ Refus DSI.
* ❌ Risque juridique.
* ❌ Produit invendable.

---

## 1️⃣1️⃣ Attentes Personnelles

**Je m’attends à :**
- 💻 Code propre et architecture claire.
- 🛡️ Sécurité prioritaire.
- 📝 Documentation compréhensible.
- ⚠️ Pas de raccourci dangereux.
- 💬 Communication proactive si blocage.

---

## 🎯 Résumé Final

Tu construis le composant le plus sensible du produit.

**L’Agent est :**
- Le gardien des données
- Le garant de la sécurité
- Le pont vers Sage

**Il doit être :**
- Simple
- Sécurisé
- Robuste
- Invisible