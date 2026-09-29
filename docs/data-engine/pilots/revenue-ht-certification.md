# Protocole de certification Gate 1 — `revenue_ht`

**Document de certification historique.** Les cases et statuts ci-dessous reflètent l'instantané de leur rédaction, pas l'état du déploiement actuel. Dans la branche de productisation, `revenue_ht` est enregistré sans `DATA_ENGINE_REVENUE_HT_PILOT_ENABLED` ; le déploiement de ce changement reste à effectuer. Les preuves E2E rapportées depuis couvrent notamment valeur positive, `empty`, zéro, période relative et cache MISS→HIT. La décision métier et la preuve complète d'isolation tenant restent distinctes de ces contrôles.

**Statut : contrôles Sage directs partiels exécutés — Gate 1 BLOQUÉ.** La comparaison complète via l'Agent installé et le backend reste à exécuter. Les montants des fixtures et du harness technique ne sont pas des preuves de conformité Sage.

## 1. Définition métier à faire signer

Renseigner chaque ligne avec la règle retenue, sa source vérifiable et le nom du valideur. Ne pas déduire la règle du seul nom `ca_ht`.

| Point à valider | Proposition ou question à trancher | Décision / preuve / valideur |
| --- | --- | --- |
| Nom métier | « Chiffre d'affaires HT comptable » ou « CA HT facturé » ? | À renseigner |
| Description | Ce que mesure le montant, avant/après remises, taxes et corrections. | À renseigner |
| Source de vérité | `dbo.VW_FINANCE_GENERAL.ca_ht` validée comme source technique ; documenter sa version et le valideur métier. | Validation métier à renseigner |
| Formule exacte | Candidat actuel : somme des montants des comptes 70, crédit positif et débit négatif. Confirmer ou remplacer explicitement. | À renseigner |
| Date de référence | Candidat : `EC_Date`, exposée par `calendrier.dt_jour` ; confirmer date comptable ou date de facture et fuseau. | À renseigner |
| Comptes / types de documents | Préfixe `70` si formule comptable ; sinon codes de pièces et statuts inclus. | À renseigner |
| Avoirs | Débit du compte 70 négatif dans le candidat ; confirmer tous les cas d'avoir, y compris avoir non comptabilisé. | À renseigner |
| Écritures manuelles | Incluses ou exclues ? Identifier journaux ou origines concernés. | À renseigner |
| Annulations | Contrepassations, pièces annulées et doublons : préciser le signe et les exclusions. | À renseigner |
| Devises | Devise de tenue, conversion éventuelle, date/taux de change et règle d'arrondi. `XOF` est une hypothèse du catalogue, pas une preuve de la base pilote. | À renseigner |
| Société / établissement | Entité Sage et organisation Cockpit correspondantes ; préciser si plusieurs sociétés ou établissements partagent la base. | À renseigner |
| Exclusions | Comptes, journaux, statuts, exercices, écritures provisoires ou intercos à exclure. | À renseigner |
| Cas particuliers | Dates sans calendrier, exercice décalé, écritures antidatées, montants nuls ou autres exceptions. | À renseigner |

**Décision métier :** formule approuvée ☐ / refusée ☐ ; nom, rôle, date et référence de validation : **à renseigner**. Si la formule approuvée diffère du candidat implémenté, marquer le Gate 1 **FAIL** et corriger le pilote avant de mesurer sa conformité.

## 2. Environnement de certification

La base locale `SAGE100` / `BIJOU` a été mise à disposition pour ce projet en **lecture seule**. Toute certification doit continuer à utiliser cette base autorisée sans écriture ; son nom seul n'établit pas l'organisation Cockpit correspondante.

- [x] Base Sage autorisée identifiée : instance locale `SAGE100`, base `BIJOU`, SQL Server 2022 Express `16.0.1000.6` ; seules des requêtes `SELECT` ont été exécutées. Le compte Windows observé est `db_owner`, donc la limitation des droits en lecture seule n'est **pas** garantie ; organisation Cockpit et principal de test à confirmer avant E2E.
- [x] Définition de `VW_FINANCE_GENERAL` et colonnes utiles relevées ; `ca_ht NUMERIC(38,6)`, `dt_jour DATE`, `annee_mois VARCHAR` ; accès lecture seule vérifié.
- [ ] Organisation Cockpit correspondante : ID **à renseigner** ; association à la base/à l'Agent vérifiée ; `dataTimezone` **à renseigner** ; devise **à renseigner**.
- [ ] Agent pilote identifié : ID/version **à renseigner** ; protocole 2 et capacités `query_parameters`/`typed_schema` négociés ; opt-in V2 explicitement activé uniquement pour cet agent.
- [ ] Utilisateur de test : ID/rôle **à renseigner** ; permission `read:data` et organisation effective vérifiées côté serveur. Le modèle actuel ne prouve pas de droits fins par société, établissement ou agence : ne pas les présumer.
- [ ] Période avec écritures connues choisie **à renseigner** ; mois sans données vérifié ; période à somme exactement nulle identifiée si elle existe réellement.
- [ ] Identifiants de `queryId`, `jobId`, empreinte/version de registre et horodatage consignés pour chaque exécution ; données sensibles et secrets exclus du rapport partagé.
- [ ] Conditions de conservation d'ADR-005 confirmées avant toute persistance de lignes Sage dans le cache V2.

## 3. Méthode et critère de décision

Pour chaque scénario, envoyer un `QueryRequest` V2 via l'API pilote, enregistrer **le SQL et les paramètres réellement envoyés** à l'Agent, puis exécuter séparément le [SQL de référence candidat](../revenue-ht-reference.sql) sur **la même base Sage test** avec les mêmes bornes civiles. Pour `month`, grouper la référence par mois comptable ; pour une comparaison, exécuter aussi la référence sur la période comparée. Le widget V1 n'est pas une référence.

Une période utilise `>= @dateFrom` et `< @dateTo`, dans le fuseau de l'organisation. Noter les bornes calculées, la version de la vue et la devise. Comparer les valeurs **exactement au centime** ; tout écart non nul est `FAIL`, sauf règle d'arrondi métier approuvée, écrite ici avec un exemple chiffré et son valideur : **à renseigner**. Comparer aussi le statut : somme nulle avec écritures = `success` et `0,00` ; aucune écriture = `empty` ; erreur SQL = `error`. Ne jamais assimiler ces états.

### Requêtes à soumettre

Base commune : `{"version":"2","metric":"revenue_ht"}`. Ajouter uniquement les champs indiqués ci-dessous ; `scope`, `organizationId`, connecteur et SQL libre sont interdits dans la demande publique.

| ID | Scénario | Champs à ajouter au `QueryRequest` | Bornes/référence à documenter |
| --- | --- | --- | --- |
| M1 | `current_month` | `"period":{"type":"relative","value":"current_month"}` | Mois civil courant dans `dataTimezone` |
| Q1 | `current_quarter` | `"period":{"type":"relative","value":"current_quarter"}` | Trimestre civil courant |
| Y1 | `current_year` | `"period":{"type":"relative","value":"current_year"}` | Année civile courante |
| A1 | Plage absolue | `"period":{"type":"absolute","from":"<ISO avec offset>","to":"<ISO avec offset>"}` | Bornes à minuit local, fin exclue |
| E1 | Mois sans données | Même forme absolue sur un mois confirmé vide | `COUNT_BIG(*) = 0` attendu |
| Z1 | Valeur zéro, si disponible | Même forme absolue sur une période avec écritures se compensant | `COUNT_BIG(*) > 0`, somme `0,00` |
| G1 | Groupement mensuel | Période Y1 ou A1, plus `"dimensions":["month"]` | Référence groupée par mois ; comparer chaque ligne |
| P1 | `previous_period` | Période M1, plus `"comparison":{"type":"previous_period"}` | Mois civil précédent, requête de référence séparée |
| N1 | `previous_year` | Période M1, plus `"comparison":{"type":"previous_year"}` | Même mois N-1, requête de référence séparée |

### Matrice à remplir avec les résultats **Sage réels**

Dupliquer la ligne si plusieurs périodes, sociétés ou cas limites sont retenus. Inscrire `NON EXÉCUTÉ`, jamais un montant fictif, tant que le scénario SQL direct **et** E2E V2 n'a pas été exécuté.

| ID | QueryRequest exact / `queryId` | SQL V2 + paramètres effectifs | SQL de référence + paramètres | Résultat Sage | Résultat V2 et statut | Écart au centime | PASS/FAIL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| Q1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| Y1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| A1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| E1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| Z1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ / N.A. si cas absent |
| G1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| P1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |
| N1 | À renseigner | À renseigner | À renseigner | NON EXÉCUTÉ | NON EXÉCUTÉ | — | NON TESTÉ |

## 4. Clôture du Gate 1

- [ ] Définition métier et éventuelle règle d'arrondi signées.
- [ ] Tous les scénarios applicables exécutés sur la **même base Sage de test** côté référence et côté V2 ; SQL, paramètres, résultats et écarts archivés.
- [ ] Chaque montant est égal au centime, chaque statut est correct, et tout écart est expliqué puis résolu ; aucune tolérance silencieuse.
- [ ] Organisation/Agent/utilisateur autorisés et isolation tenant démontrés ; cache miss/hit et jobs V2 vérifiés sans repli V1.
- [ ] Gate 1 décidé explicitement : **PASS / FAIL / BLOCKED** ; décision, valideur, date et lien vers preuves **à renseigner**.

**État actuel : `BLOCKED` — des mesures Sage directes existent, mais aucun rapprochement E2E avec l'Agent installé n'a été exécuté. Aucune Phase 3 n'est autorisée par ce document.**

## 5. Exécution partielle du 28 septembre 2026

Source de référence validée : `dbo.VW_FINANCE_GENERAL.ca_ht`. Le contrôle de six périodes avec/sans `cg_num LIKE '70%'` donne un écart `0,00` partout ; détails dans [le rapport pilote](revenue-ht.md). Le filtre supplémentaire a été supprimé du mapping V2. Les requêtes SQL directes et l'exécuteur **local** Agent V2 concordent sur janvier 2022 (`4 186 862,37`, 62 lignes), février 2022 (`0,00`, 1 ligne), mars 2022 (`NULL`, 0 ligne), décembre 2021 (`70 560,00`, 48 lignes) et le groupement mensuel 2022 (janvier `4 186 862,37`, février `0,00`, décembre `10 000,00`). Ce contrôle local n'est pas l'E2E requis par la matrice. Le résultat SQL brut comporte six décimales ; l'Agent ne le ramène à deux que si les décimales supplémentaires sont nulles et rejette une fraction de centime.

Le build Agent de test `1.1.0` / `node18-win-x64` existe dans `cockpit-agent/dist/gate1-test/`, séparé du build historique. Le service installé est arrêté et son opt-in V2 absent. Sa configuration actuelle désigne l'hôte Cockpit existant ; l'organisation et le token **de test** nécessaires au parcours E2E ne sont pas établis, et le PostgreSQL configuré pour le backend répond `XX000 (ENOTFOUND)` lors de la lecture du catalogue. Aucun changement de configuration ni connexion du nouvel Agent à cet hôte n'a été effectué. Les lignes M1 à N1 de la matrice restent **NON TESTÉES en E2E** ; aucun `PASS` Gate 1 n'est revendiqué. Les contrôles cache, empreinte, déduplication, Agent offline, timeout et isolation tenant attendent ce même environnement de test.
