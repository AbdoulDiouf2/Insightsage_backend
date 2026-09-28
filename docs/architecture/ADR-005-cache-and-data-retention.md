# ADR-005 — Cache, fraîcheur et conservation des résultats

**Statut :** décision produit provisoire B ; validations opérationnelles et contractuelles requises avant production. Aucune purge ou migration de données autorisée par cette ADR seule.

## Problème et architecture actuelle

Les commentaires « Zero-Copy » ne décrivent pas le comportement réel : `AgentsService.updateJobResult` persiste les lignes dans `AgentJob.result` en PostgreSQL. Une requête SQL identique et terminée peut être réutilisée pendant cinq minutes. `useKpiData` conserve une valeur normalisée dans `localStorage` pendant 60 minutes, sous une clé qui n'inclut ni organisation ni utilisateur. Le logout ne vide pas ce cache. Les tables `AgentViewSnapshot` existent mais l'ingestion actuelle n'alimente pas leurs données. Sources : `src/agents/agents.service.ts` (`updateJobResult`, `executeRealTimeQuery`, `ingestData`), `prisma/schema.prisma`, `../Client-cockpit/src/lib/cache.ts`, `../Client-cockpit/src/hooks/use-kpi-data.ts`, `../Client-cockpit/src/features/auth/AuthContext.tsx`.

## Décision produit provisoire

Retenir provisoirement **B — cache cloud contrôlé** pour la première migration, sous réserve des validations opérationnelles et contractuelles avant production : les jobs asynchrones ont besoin d'une remise de résultat après la réponse de l'agent. La conservation doit avoir un TTL court, un chiffrement, une isolation tenant et une purge vérifiable. Tant que cette validation n'est pas obtenue, cette architecture ne doit pas être qualifiée de « Zero-Copy » strict et aucune extension de collecte de données n'est autorisée. Une évolution ultérieure vers A exige une nouvelle décision ; elle reste possible avec magasin de résultats éphémère sans persistance disque et protocole de livraison adapté ; elle requiert un autre gate et des tests de panne.

| Niveau | Politique cible proposée | Clé et isolation |
|---|---|---|
| L1 navigateur | Désactivé par défaut pour données sensibles ; sinon TTL maximal 5 min, purge logout/changement d'organisation | `organizationId:userId:queryFingerprint:contractVersion` |
| L2 backend résultat V2 | TTL métrique, 5 min par défaut, borné par politique de données ; expiration et purge vérifiables | `organizationId:queryFingerprint:registryVersion`; accès toujours contrôlé par tenant |
| Métadonnées jobs | Durée de conservation distincte du payload, à fixer avec exploitation avant migration | tenant, `queryId`, `jobId`, timestamps |
| Logs techniques | Rétention distincte, sans lignes métier, secret ni SQL sensible | tenant, `requestId`, `queryId`, `jobId` |
| Source Sage | Reste la source de vérité | base et compte du client |

Le résultat V2 en base est chiffré au repos avec une clé gérée hors de PostgreSQL (rotation et restauration testées) et exclu des logs. L'accès, la sauvegarde, la restauration et la suppression doivent suivre la même durée contractuelle ; une simple suppression des lignes actives ne suffit pas si des sauvegardes les conservent. Le processus de purge doit être observé et testé. Le contenu et les durées ci-dessus sont des **cibles à approuver**, pas une affirmation sur l'infrastructure actuelle.

## Cache et fraîcheur

L'empreinte canonique inclut le `SecurityScope` effectif dérivé côté serveur, les `AnalyticalFilters` avec leurs valeurs, métrique, dimensions, bornes de période, comparaison, devise, identifiant de connecteur, ressource et version du registre. La réutilisation d'un job V1 par SQL identique reste séparée. Une erreur, un résultat `empty` et une valeur zéro sont des états distincts ; la politique peut choisir de mettre `empty` en cache brièvement, jamais une erreur en tant que valeur zéro. Le cache ne doit pas masquer un changement d'autorisation.

Chaque résultat indique séparément :

- `queryExecutedAt` : date réelle de l'interrogation Sage ;
- `sourceFreshness` : dernier changement source **si mesurable** ;
- `cachedAt` : moment de la mise en cache ;
- `generatedAt` : création de la réponse courante ;
- `meta.cache` : `none`, `browser` ou `backend`.

Une valeur inconnue n'est pas remplacée par `lastSeen`, `lastSync` ou la date du navigateur. Un cache L1 doit conserver et restituer les timestamps du résultat d'origine. Le bouton de rafraîchissement demande explicitement un contournement du cache selon une option autorisée, sans changer la sémantique métier du `QueryRequest`.

## Alternatives étudiées

**Avantages de B :** restitution asynchrone et cache mesurable compatibles avec les jobs. **Inconvénients :** traitement de données client dans le cloud, coûts de chiffrement, de purge et de contrôle des sauvegardes. B est la décision produit provisoire ; ses conditions de mise en production restent à valider.

| Option | Avantage | Coût / limite |
|---|---|---|
| A — Zero-Copy strict | Pas de résultat durable côté cloud | Livraison asynchrone, reconnexion et reprise plus complexes ; Redis persistant ne satisfait pas automatiquement cette définition. |
| B — cache cloud contrôlé | Compatible avec jobs asynchrones et comparaison de résultats | Nécessite chiffrement, TTL, purge, sauvegardes et base contractuelle. |
| Conservation actuelle indéfinie | Aucun changement immédiat | Rejetée : durée et promesse produit non maîtrisées. |

## Impacts et migration

Phase 0 isole/purge le cache navigateur et décrit honnêtement la persistance actuelle, sans suppression historique. Phase 1 implémente les clés V2, les métadonnées de fraîcheur, les règles de TTL et les tests sur des données factices ; la migration Prisma et la purge éventuelle attendent le gate adéquat. Phase 2 mesure le pilote et vérifie qu'un résultat redemandé, une autre organisation et un autre utilisateur reçoivent les bons accès et timestamps.

## Compatibilité

Les résultats V1 restent lisibles pendant la coexistence et leur durée de conservation doit faire l'objet d'une décision distincte avant toute purge. Les caches V1 sont isolés et purgés au logout en Phase 0, mais leur format historique n'est pas interprété comme un `QueryResult` V2. Aucun résultat persistant n'est supprimé rétroactivement sur la seule base de cette ADR.

## Critères de validation

Validation opérationnelle et contractuelle de B : catégories de données autorisées, durée, sauvegardes, chiffrement, isolation tenant, purge vérifiable, droits d’accès et formulation produit et contractuelle cohérente. Tests d'isolation tenant/utilisateur, changement de période, expiration, invalidation des droits et restitution de fraîcheur. Aucune politique de production ne peut être déduite de cette ADR sans ces vérifications.
