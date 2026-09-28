# ADR-003 — Machine d'état des jobs V2

**Statut :** proposé, en attente de validation.

## Problème et architecture actuelle

`AgentJob` possède `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`. `AgentsService.executeRealTimeQuery` marque `RUNNING` après une émission Socket.IO sans ACK. `updateJobResult` peut écraser un état terminal. Une réponse rapide peut précéder l'écriture de `RUNNING`. Le nettoyage marque les jobs de plus de 30 secondes comme échoués lors d'un balayage de 60 secondes, et la déconnexion échoue tous les jobs actifs de l'organisation. Les appels identiques simultanés ne sont pas dédupliqués. Sources : `src/agents/agents.service.ts` (`createJob`, `executeRealTimeQuery`, `updateJobResult`, `cleanupStaleJobs`, `failActiveJobsForOrg`) et `src/agents/agents.gateway.ts` (`emitExecuteSql`, `handleSqlResult`).

## Décision proposée

Ajouter un **Job Engine V2 séparé**. La base de données est la source de vérité des états. Chaque transition est une écriture conditionnelle et atomique (`WHERE state IN (...) AND version = ...` ou équivalent transactionnel) ; un état terminal ne peut pas être remplacé. Les événements Socket.IO sont corrélés à `requestId`, `queryId`, `jobId` et à l'identité authentifiée de l'agent. Les réponses d'un autre agent ou d'un autre tenant sont rejetées.

```ts
type JobState = 'PENDING' | 'DISPATCHED' | 'RUNNING' |
  'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';

interface JobRecordV2 {
  id: string;
  queryId: string;
  requestId: string;
  organizationId: string;
  agentId: string;
  queryFingerprint: string;
  state: JobState;
  version: number;
  attempt: number;
  createdAt: string;
  dispatchedAt?: string;
  acknowledgedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  dispatchDeadlineAt: string;
  executionDeadlineAt?: string;
  resultExpiresAt?: string;
  errorCode?: string;
}
```

| Depuis | Événement | Vers |
|---|---|---|
| `PENDING` | émission vers socket sélectionnée | `DISPATCHED` |
| `PENDING` | délai d'attente avant émission | `TIMED_OUT` |
| `PENDING` | annulation autorisée | `CANCELLED` |
| `DISPATCHED` | `query_acknowledged` valide | `RUNNING` |
| `DISPATCHED` | délai d'ACK, erreur transport | `TIMED_OUT` / `FAILED` |
| `DISPATCHED` | annulation autorisée | `CANCELLED` |
| `RUNNING` | résultat valide | `COMPLETED` |
| `RUNNING` | erreur agent | `FAILED` |
| `RUNNING` | délai d'exécution | `TIMED_OUT` |
| `RUNNING` | annulation autorisée | `CANCELLED` |
| terminal | tout événement ultérieur | inchangé ; diagnostic d'événement tardif |

Un résultat reçu avant l'ACK est conservé comme événement et traité par une transition transactionnelle compatible ; il ne peut jamais laisser le job bloqué en `RUNNING`. Les ACK et résultats répétés sont idempotents selon `(jobId, agentId, eventType, sequence)` ; un second payload contradictoire est journalisé puis rejeté.

L'empreinte est SHA-256 d'une représentation canonique **tenant-scopée** de la demande résolue : `SecurityScope` effectif dérivé de la connexion authentifiée (dont l’organisation), métrique, dimensions triées si commutatives, `AnalyticalFilters` normalisés avec leurs valeurs, bornes de période, comparaison, devise, identifiant de connecteur, version du registre et ressource source. La valeur d’un filtre ne disparaît jamais de cette représentation. Ni la demande publique ni le payload agent ne peuvent élargir le `SecurityScope`. Une contrainte unique ou un verrou transactionnel protège la création de deux jobs actifs identiques ; le résultat d'un job terminé reste réutilisable seulement selon le TTL de la métrique. Un changement de version du registre invalide l'empreinte.

`dispatchTimeout`, `executionTimeout` et `frontendTimeout` sont distincts et configurés explicitement. Le backend vérifie les deadlines persistées après redémarrage ; un worker de reprise classe les jobs échus et ne réémet que les jobs dont l'agent peut dédupliquer l'ID. Aucun retry SQL automatique après une exécution potentiellement réussie sans confirmation. L'annulation expose `POST /api/data/jobs/:id/cancel`, vérifie le tenant et transmet `cancel_query` si le driver le permet ; sinon elle arrête la livraison du résultat et retourne un état explicite avec la limite physique documentée. La preuve d'annulation du driver est requise avant d'annoncer une interruption SQL effective.

## API et résultat

`POST /api/data/query` retourne `{ status: 'completed', result }` sur cache autorisé, ou `{ status: 'pending', jobId, queryId }`. `GET /api/data/jobs/:id` renvoie état, résultat éventuel ou erreur typée. `pending` n'est jamais un succès métier. L'API ne révèle pas le SQL brut du plan au navigateur. Le connecteur V1 reste distinct et conserve ses réponses actuelles pendant la migration.

## Alternatives étudiées

| Option | Analyse |
|---|---|
| Ajouter seulement `TIMED_OUT` à `AgentJob` | Insuffisant sans ACK, transitions conditionnelles et corrélation agent. |
| File entièrement en mémoire | Rejetée : perd les jobs et la déduplication au redémarrage. |
| État persistant avec transitions atomiques | Retenu : vérifiable et compatible avec une reprise contrôlée ; ajoute des écritures et de la coordination. |

## Avantages, inconvénients, impacts et migration

L'avantage est une issue déterministe, même pour réponse tardive, doublon, déconnexion ou plusieurs workers. Le coût est une table ou un modèle V2, des contraintes, un dispatcher et des tests de concurrence. Phase 1 crée et teste cette machine sans connecter les widgets ; Phase 2 la branche seulement sur le KPI pilote. L'isolation tenant, l'ACK et la reprise sont des conditions du gate pilote.

## Compatibilité

Les jobs V1 et leurs données restent lisibles et leurs endpoints restent inchangés pendant la coexistence. Aucun changement de statut V1 n'est déduit de la seule émission WebSocket dans le modèle V2. Un agent sans capacité d'ACK V2 reste sur le protocole V1 ; le backend ne déclare jamais son job V2 `RUNNING` par hypothèse.

## Conditions à vérifier avant implémentation

Déterminer le déploiement multi-worker, la stratégie transactionnelle Prisma/PostgreSQL et la sémantique réelle d'annulation `mssql`/`msnodesqlv8`. Les tests devront couvrir résultat avant ACK, ACK en double, réponse tardive, agent usurpé, concurrentes identiques, redémarrage et cache expiré.
