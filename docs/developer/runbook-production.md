---
title: Runbook Production — Incidents & Exploitation
description: Diagnostic et résolution des incidents récurrents en production (Redis, PM2, reboots hyperviseur, suppression d'organisation). Serveur Windows Server 2022 Nafaka Tech.
---

# Runbook Production

Ce document couvre les incidents déjà rencontrés en production, leur cause réelle et la procédure
de résolution. Il existe pour éviter de rediagnostiquer deux fois le même problème.

!!! info "Environnement concerné"
    Serveur Windows Server 2022 (build 20348), VM chez l'hébergeur. API NestJS en cluster PM2
    2 instances, PostgreSQL 16 natif, Redis 8.8.0 natif en service NSSM, IIS en reverse proxy.

---

## 1. La VM redémarre toute seule

**Ce n'est pas un crash.** L'hébergeur éteint périodiquement la VM. Trace dans le journal Système :

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074,6008,41} -MaxEvents 10 |
    Format-List TimeCreated, Id, Message
```

```
Le processus qemu-ga.exe a lancé la mise hors tension de l'ordinateur COCKPIT
pour l'utilisateur AUTORITE NT\Système — raison : Autre (planifié)
```

`qemu-ga.exe` est l'agent invité QEMU : l'ordre vient de l'hyperviseur, pas de Windows.

**Conséquence pratique** : tout composant qui ne redémarre pas automatiquement au boot sera absent
après un arrêt, sans aucune alerte. C'est la cause racine de l'incident Redis ci-dessous.

Vérifier la date du dernier démarrage :

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object LastBootUpTime
```

---

## 2. Redis injoignable — « Cache Redis : Erreur » sur la page Santé

### Symptômes

- Page Santé Système : Cache Redis `disconnected`, message `Redis client not ready`
- Logs PM2 : `[Redis] Connexion perdue (ECONNREFUSED) — mode dégradé, reconnexion en cours`

### Diagnostic

```powershell
Get-Service Redis | Select-Object Name, Status, StartType
redis-cli -h 127.0.0.1 ping
redis-cli -h ::1 ping
netstat -ano | Select-String ":6379"
Get-Content C:\Cockpit\logs\redis.log -Tail 60
```

| Constat | Interprétation |
|---|---|
| Rien n'écoute sur 6379 | Redis n'est pas démarré — voir « Cause historique » |
| IPv4 répond, IPv6 non | Le `-::1` manque dans les paramètres du service |
| Le log s'arrête sans message d'arrêt | Le processus a été tué net, il n'a pas planté |
| Le log finit par « ready to exit, bye bye » | Arrêt propre — quelqu'un ou quelque chose l'a stoppé |

!!! tip "Redis journalise sa propre mort"
    Un arrêt propre écrit `Redis is now ready to exit, bye bye...`. Son absence signifie que le
    processus a été tué (kill, arrêt de son parent, extinction de la VM).

### Résolution

```powershell
Start-Service Redis
redis-cli ping
```

L'API se reconnecte seule, **sans redémarrage** : le client applique un backoff exponentiel plafonné
à 5 s. Inutile de relancer `cockpit-api`.

### Cause historique — trois configurations qui ont échoué

| Configuration | Résiste au kill | Résiste au reboot | Verdict |
|---|:---:|:---:|---|
| Task Scheduler `AtStartup` | ❌ | ✅ | Ne relançait jamais après un crash |
| PM2 (`interpreter: 'none'`) | ✅ | ❌ | Ne resurrectait pas le `.exe` au boot |
| **Service NSSM** | ✅ | ✅ | Configuration actuelle |

Les deux premières ont été validées à tort sur un kill à chaud, alors que le cas réel en production
est le reboot. **Tout changement de supervision doit être validé par un `Restart-Computer -Force`**,
jamais par un simple `Stop-Process`.

### Ce qui fonctionne pendant une coupure Redis

Depuis le passage en mode dégradé, l'API reste opérationnelle sans cache :

| Fonction | Comportement sans Redis |
|---|---|
| Connexion | Fonctionne — le verrouillage anti-brute-force est suspendu (*fail-open* assumé) |
| Permissions | Fonctionne — lecture directe en base au lieu du cache |
| Rate limiting SQL | Suspendu (*fail-open*) |
| Favoris / historique NLQ | Listes vides, pas d'erreur |
| Statut des tâches planifiées | Repli sur la mémoire du worker courant |

!!! warning "Avant le correctif d'août 2026"
    L'API se figeait entièrement : la file d'attente hors-ligne de `node-redis` mettait les commandes
    en attente au lieu de les rejeter, et leurs promesses ne se résolvaient jamais. Voir
    `src/redis/redis.module.ts` — l'option `disableOfflineQueue: true` ne doit pas être retirée.

---

## 3. Pièges PM2 sur Windows

### `pm2 startup` ne fonctionne pas

```
[PM2][ERROR] Init system not found
```

Normal : PM2 ne gère pas le démarrage automatique sous Windows. C'est le service `cockpitpm2.exe`
(`Running` / `Automatic`) qui resurrecte les process depuis `C:\Cockpit\pm2_home\dump.pm2`.

### Deux démons PM2 en conflit

```
PM2 error: EPERM: operation not permitted, open 'C:\Cockpit\pm2_home\pm2.pid'
```

Un démon lancé sous un compte utilisateur entre en conflit avec celui du service SYSTEM. Symptôme
visible : la colonne `user` de `pm2 list` alterne entre `Système` et un compte nominatif.

**Conséquence** : un `pm2 save` peut ne pas viser le démon qui sera resurrecté au boot. Ne jamais
considérer un `pm2 save` comme acquis sans vérifier le contenu du dump :

```powershell
Select-String -Path C:\Cockpit\pm2_home\dump.pm2 -Pattern "redis" -Quiet
```

### Ne pas superviser un `.exe` avec PM2

PM2 est fait pour des applications Node. Pour un exécutable natif, utiliser un service Windows
(NSSM). Si c'est malgré tout nécessaire : `interpreter: 'none'`, `exec_mode: 'fork'`, et viser le
binaire réel plutôt qu'un shim Chocolatey.

### Déploiement

Le pipeline CI n'exécute que `pm2 reload cockpit-api`. Les autres entrées PM2 survivent donc aux
déploiements, et un déploiement ne rétablit jamais un process manquant.

---

## 4. Tâches planifiées en cluster

L'API tourne en cluster 2 instances. **Chaque worker charge l'application entière**, donc chaque
`@Cron` et chaque `setInterval` s'exécute une fois par worker.

Sans garde, le cron de rappel de fin d'essai envoyait deux emails à chaque client.

`src/common/scheduler-leader.ts` expose `isSchedulerLeader()`, qui teste `NODE_APP_INSTANCE` —
variable posée par PM2 en mode cluster uniquement. Elle garde trois points d'entrée :

| Fichier | Tâche |
|---|---|
| `src/billing/billing-scheduler.service.ts` | Cron quotidien des rappels de fin d'essai |
| `src/agents/agents.service.ts` | Agents hors ligne, nettoyage jobs, tokens |
| `src/health/health-monitor.service.ts` | Sondes de santé et alertes |

!!! warning "Toute nouvelle tâche planifiée doit passer par cette garde"
    Sinon elle s'exécutera en double en production, sans que ce soit visible en développement
    (où `NODE_APP_INSTANCE` est absent et où tout s'exécute normalement).

**Limite connue** : si le worker 0 est arrêté, aucune tâche planifiée ne tourne jusqu'à ce que PM2
le relance. PM2 réattribue le même index au redémarrage.

Le statut des jobs est publié dans un hash Redis partagé (`health:jobs`) pour que `/health/jobs`
réponde la même chose quel que soit le worker qui sert la requête.

---

## 5. Suppression d'organisation bloquée

### Symptôme

```
update or delete on table "users" violates RESTRICT setting of
foreign key constraint "bugs_submitted_by_id_fkey" on table "bugs"
```

### Cause

Prisma applique `onDelete: Restrict` **par défaut** sur toute relation obligatoire sans règle
explicite. Seize relations étaient dans ce cas, bloquant la cascade en chaîne.

### Comportement actuel

- Les données propres à l'organisation (agents, dashboards, widgets, sessions NLQ, facturation)
  sont **supprimées en cascade** par la base.
- Les contenus rédigés par ses utilisateurs (tickets, commentaires, notes de demandes de démo)
  sont **anonymisés** : la colonne auteur passe à `NULL`, l'historique est conservé.

Les interfaces affichent « Utilisateur supprimé » à la place de l'auteur. Toute nouvelle vue
exploitant `submittedBy` ou `author` doit traiter le cas `null`.

### Si l'erreur réapparaît

`deleteOrganization` traduit `P2003` en message lisible, mais le détail part dans les logs :

```powershell
pm2 logs cockpit-api --lines 200 --nostream | Select-String "contrainte FK"
```

Le nom de la contrainte désigne la relation à corriger dans `prisma/schema.prisma`.

---

## 6. Migrations Prisma — historique désynchronisé

!!! danger "Ne pas exécuter `prisma migrate deploy` sur cette base"
    L'historique de migrations est incomplet : plusieurs tables (`bugs`, `demo_requests`,
    `billing_subscriptions`, `agent_sync_batches`) n'apparaissent dans aucune migration, le schéma
    ayant été appliqué par `prisma db push`. Un `migrate deploy` tenterait de rejouer d'anciennes
    migrations sur des tables existantes.

Procédure pour un changement de schéma :

1. Modifier `prisma/schema.prisma`
2. Générer le SQL hors ligne, sans toucher à la base :

```bash
npx prisma migrate diff --from-schema <ancien>.prisma --to-schema prisma/schema.prisma --script
```

3. Relire le SQL, le versionner dans `prisma/migrations/<timestamp>_<nom>/migration.sql`
4. L'appliquer manuellement (éditeur SQL Supabase ou `psql`)

---

## 7. Lecture de la page Santé Système

`/health` côté admin interroge `/health/db`.

| Carte | Erreur fréquente | Piste |
|---|---|---|
| API | — | Si la page répond, l'API tourne |
| Base de données | `disconnected` | Service `postgresql-x64-16`, identifiants du `.env` |
| Cache Redis | `Redis client not ready` | Section 2 |
| Doc MkDocs | `fetch failed` | Le service qui sert MkDocs n'est plus dans `pm2 list` |
| MinIO | `disconnected` | `R2_ENDPOINT` et le service MinIO |

Le panneau « Tâches planifiées » reste vide tant qu'aucun job n'a tourné depuis le dernier
redémarrage — compter jusqu'à 60 s après un reload.

---

## Commandes de vérification rapide

```powershell
# Services
Get-Service Redis, postgresql-x64-16 | Select-Object Name, Status, StartType

# Process applicatifs
pm2 list

# Connectivité
redis-cli ping
redis-cli -h ::1 ping

# Logs
Get-Content C:\Cockpit\logs\redis.log -Tail 50
pm2 logs cockpit-api --lines 100 --nostream

# Dernier boot et arrêts
Get-CimInstance Win32_OperatingSystem | Select-Object LastBootUpTime
Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 5 | Format-List TimeCreated, Message
```
