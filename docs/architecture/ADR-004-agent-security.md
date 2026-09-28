# ADR-004 — Sécurité et protocole versionné de l'agent Sage

**Statut :** proposé, en attente de validation.

## Problème et architecture actuelle

Le service Node écoute `0.0.0.0:8444`; son `POST /execute_sql` accepte une demande SQL sans authentification. Le backend pousse `execute_sql { jobId, sql }` au namespace `/agents`. Les contrôles SQL de l'agent utilisent des expressions régulières, une allowlist optionnelle et un `TOP` inséré dans la chaîne. Les tokens sont validés au handshake, puis la socket reste authentifiée ; le backend conserve actuellement le token en clair dans `Agent.token`. La présence est gardée dans des maps locales au processus. Sources : `../cockpit-agent/service/src/utils/health.js` (`start`), `../cockpit-agent/service/src/jobs/sql-security.js` (`validate`), `../cockpit-agent/service/src/ws/agent-socket.js` (`connect`, `_execute`), `src/agents/agents.gateway.ts` et `src/agents/agents.service.ts`.

## Décision proposée

Le protocole V2 est **négocié par capacité** après authentification. Un agent V1 continue à recevoir les seuls événements V1. Un agent V2 annonce ses versions et capacités, puis reçoit un plan d'exécution dont le SQL et les paramètres proviennent exclusivement du backend. Le serveur dérive le tenant de la socket authentifiée et lie chaque job à l'`agentId` enregistré. Le `SecurityScope` du `QueryPlan` est résolu côté serveur depuis l’identité et les permissions du demandeur ; ses contraintes et les `AnalyticalFilters` sont compilés dans l’exécution avant l’envoi à l’agent. L’organisation est le contrôle RBAC actuel ; les droits par société, établissement ou agence restent à définir et vérifier. Ni `QueryRequest` ni un payload agent ne peuvent fournir ou élargir ce périmètre. Les résultats de l’agent sont acceptés seulement pour le job et la connexion authentifiée attendus. Les paramètres sont transmis comme valeurs typées ; seuls les noms de colonnes/vues validés par le registre peuvent entrer dans le statement. Le compte SQL d'exécution est limité à la lecture des vues nécessaires. Les opérations d'installation de vues utilisent un compte séparé à privilèges temporaires.

```ts
type AgentCapability = 'query_parameters' | 'query_cancel' |
  'chunked_results' | 'typed_schema' | 'source_freshness';

interface AgentHelloV2 {
  protocolVersions: Array<1 | 2>;
  agentVersion: string;
  capabilities: AgentCapability[];
}
interface AgentExecuteQueryV2 {
  protocolVersion: 2;
  jobId: string;
  queryId: string;
  requestId: string;
  statement: string;
  parameters: Record<string, string | number | boolean | null>;
  limits: { maxRows: number; timeoutMs: number; maxResultBytes: number };
}
interface AgentQueryAcknowledgedV2 {
  protocolVersion: 2;
  jobId: string;
  queryId: string;
  sequence: number;
  acceptedAt: string;
}
interface AgentQueryResultV2 {
  protocolVersion: 2;
  jobId: string;
  queryId: string;
  sequence: number;
  status: 'success' | 'error';
  schema?: Array<{ key: string; type: string; nullable: boolean }>;
  rows?: Record<string, unknown>[];
  meta?: { rowCount: number; executionTimeMs: number; truncated: boolean;
    sourceFreshness?: string };
  error?: { code: string; message: string };
}
interface AgentCancelQueryV2 {
  protocolVersion: 2;
  jobId: string;
  queryId: string;
}
interface AgentProtocolV2 {
  hello: AgentHelloV2;
  execute: AgentExecuteQueryV2;
  acknowledged: AgentQueryAcknowledgedV2;
  result: AgentQueryResultV2;
  cancel: AgentCancelQueryV2;
}
```

Pour les gros résultats, choisir d'abord **agrégation à la source et plafond explicite**. Le backend fixe `maxRows` et `maxResultBytes` selon la métrique. Une réponse dépassant le plafond retourne `RESULT_TOO_LARGE`, jamais une troncature silencieuse. `chunked_results` est une capacité future : ne l'annoncer qu'après protocole de séquence, checksum, ACK par chunk, limite totale et tests de déconnexion. Cette décision évite de dépendre implicitement du buffer Engine.IO ; elle ne prétend pas satisfaire les analyses massives avant une ADR spécifique.

L'API de diagnostic doit être liée à `127.0.0.1` dans la Phase 0. `POST /execute_sql` doit être supprimé si l'installeur et les outils d'exploitation n'en ont plus besoin ; sinon il exige une authentification locale forte et une limitation de débit, avec vérification des appels existants. Le `GET /health` local peut rester accessible sur loopback. Pour l'accès distant, une décision séparée sur mTLS et réseau est nécessaire.

La politique de sécurité SQL interdit explicitement `SELECT INTO`, les instructions multiples, DDL/DML et l'accès aux ressources hors allowlist. Un parseur ou un plan précompilé côté backend, les paramètres SQL et les droits minimaux du compte sont des barrières complémentaires ; une regex seule ne constitue pas une garantie. Les logs conservent IDs, code d'erreur et durée, mais expurgent token, mot de passe, valeurs métier et SQL lorsque sensible.

La révocation ferme immédiatement les sockets liées à l'agent. La rotation utilise une période courte de chevauchement ou une confirmation d'installation du nouveau secret avant révocation de l'ancien ; l'échec de livraison reste récupérable. Les jetons serveur sont hachés avec un préfixe/identifiant permettant la recherche, et la migration des jetons V1 en clair est progressive. Le secret du compte Windows ne doit plus rester dans le XML WinSW sans protection ACL vérifiée et procédure de suppression ou alternative de compte de service. La présence temps réel est basée sur la socket, avec registre partagé ou affinité de routage démontrée en multi-worker ; le heartbeat reste de la télémétrie.

## Alternatives étudiées

| Option | Analyse |
|---|---|
| Ouvrir davantage l'API locale pour les outils de diagnostic | Rejetée : augmente l'exposition sans identité contrôlée. |
| Garder l'API locale SQL uniquement sur loopback | Solution de transition si des clients locaux en dépendent ; authentification reste requise. |
| Supprimer l'API locale SQL après inventaire | Cible privilégiée si aucun usage n'est établi. |
| Basculer immédiatement tous les agents vers V2 | Rejetée : incompatibilité des installations existantes. |

## Avantages, inconvénients, impacts et migration

Le versionnement protège les agents V1 et permet un ACK réel, des paramètres et des limites contrôlées. Le coût est la double prise en charge du protocole, la distribution des mises à jour et des tests de version. Phase 0 sécurise l'API locale et les invariants du chemin actuel ; Phase 1 définit et teste V2 avec agent mock ; Phase 2 l'active pour un agent pilote seulement. Aucun serveur ne doit annoncer `query_cancel` ou `chunked_results` tant que le driver et les tests n'en prouvent pas l'exécution.

**Points à vérifier :** règles pare-feu réelles, compte de service, ACL du XML WinSW, topologie PM2/proxy, prise en charge des paramètres et de l'annulation par les deux drivers SQL, commandes locales utilisées par l'installeur. La compatibilité est validée par tests V1/V2, token expiré/révoqué, reconnexion et multi-worker.
