-- Gate 1 revenue_ht: lecture directe de la source approuvee.
-- Parametres DATE @dateFrom inclus et @dateTo exclu ; aucune ecriture Sage.
-- La vue fournit ca_ht : ne pas recalculer sa formule financiere ici.
SELECT SUM(v.ca_ht) AS value, COUNT_BIG(*) AS source_row_count
FROM dbo.VW_FINANCE_GENERAL AS v
WHERE v.dt_jour >= @dateFrom AND v.dt_jour < @dateTo;

-- Variante groupee pour dimensions: ['month'].
SELECT v.annee_mois AS month, SUM(v.ca_ht) AS value,
       COUNT_BIG(*) AS source_row_count
FROM dbo.VW_FINANCE_GENERAL AS v
WHERE v.dt_jour >= @dateFrom AND v.dt_jour < @dateTo
GROUP BY v.annee_mois
ORDER BY v.annee_mois;

-- Pour previous_period et previous_year, executer la meme requete avec
-- les bornes de comparaison resolues par le Query Planner V2.
