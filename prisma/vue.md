les requêtes à mettre à jour :
USE [BIJOU]
GO

SELECT [ID_Ecriture_Comptable]
      ,[N_Analytique]
      ,[Ligne_Analytique]
      ,[Date_Analytique]
      ,[Annee]
      ,[Mois]
      ,[Periode]
      ,[Compte_General]
      ,[Libelle_Compte]
      ,[Compte_Analytique]
      ,[Code_Axe]
      ,[Libelle_Analytique]
      ,[Code_Journal]
      ,[Libelle_Journal]
      ,[Montant]
      ,[Quantite]
      ,[Sens_Code]
      ,[Sens_Libelle]
      ,[Debit]
      ,[Credit]
      ,[Solde_Signe]
      ,[Categorie_BI]
      ,[Watermark_Sync]
  FROM [dbo].[VW_ANALYTIQUE]

GO


USE [BIJOU]
GO

SELECT [ID_Ecriture]
      ,[Code_Client]
      ,[Nom_Client]
      ,[Classement]
      ,[Pays]
      ,[Date_Ecriture]
      ,[Annee]
      ,[Mois]
      ,[Periode]
      ,[Code_Journal]
      ,[Compte_General]
      ,[N_Piece]
      ,[Libelle]
      ,[Montant]
      ,[Sens_Code]
      ,[Debit_Client]
      ,[Credit_Client]
      ,[Solde_Signe]
      ,[Code_Lettrage]
      ,[Est_Lettre]
      ,[Age_Jours]
      ,[Tranche_Age]
      ,[Operateur]
      ,[Date_Saisie]
      ,[Watermark_Sync]
  FROM [dbo].[VW_CLIENTS]

GO


USE [BIJOU]
GO

SELECT [N_Piece]
      ,[Date_Document]
      ,[Annee]
      ,[Mois]
      ,[Periode]
      ,[Type_Code]
      ,[Type_Libelle]
      ,[Sens_Commercial]
      ,[Code_Tiers]
      ,[Nom_Tiers]
      ,[Classement_Tiers]
      ,[Pays_Tiers]
      ,[Total_HT]
      ,[Total_TTC]
      ,[Total_TVA]
      ,[Statut_Code]
      ,[Statut_Libelle]
      ,[Date_Livraison_Prevue]
      ,[Age_Jours]
      ,[Operateur]
      ,[Date_Saisie]
      ,[Watermark_Sync]
  FROM [dbo].[VW_COMMANDES]

GO


USE [BIJOU]
GO

SELECT [Numero_Piece]
      ,[Date_Facture]
      ,[Exercice]
      ,[Type_Piece]
      ,[Montant_HT]
      ,[Montant_TTC]
      ,[Code_Client]
  FROM [dbo].[VW_Finances_Clients_Flat]

GO


USE [BIJOU]
GO

SELECT [fournisseur]
      ,[nom_fournisseur]
      ,[annee]
      ,[mois]
      ,[type_depense]
      ,[type_classe]
      ,[categorie_bi]
      ,[sous_categorie]
      ,[kpi_tags]
      ,[total_achats_ht_par_periode]
      ,[encours_fournisseurs]
      ,[dettes_groupe]
      ,[dettes_externes]
      ,[balance_0_30]
      ,[balance_31_60]
      ,[balance_61_90]
      ,[balance_91_120]
      ,[balance_120_plus]
      ,[dettes_fournisseurs_echues_non_soldees]
      ,[dpo_individuel]
      ,[top_10_fournisseurs]
      ,[evolution_dettes_n1]
      ,[variation_dettes_yoy]
  FROM [dbo].[VW_FOURNISSEURS]

GO


USE [BIJOU]
GO

SELECT [dt_jour]
      ,[annee]
      ,[semestre]
      ,[trimestre]
      ,[mois]
      ,[libelle_mois]
      ,[annee_mois]
      ,[semaine]
      ,[annee_semaine]
      ,[libelle_semaine]
      ,[jour_mois]
      ,[jour_annee]
      ,[jour_semaine]
      ,[libelle_jour_semaine]
      ,[est_weekend]
      ,[id_ecriture]
      ,[numero_piece]
      ,[code_journal]
      ,[libelle_journal]
      ,[type_journal]
      ,[compte_general]
      ,[libelle_compte]
      ,[classe_compte]
      ,[racine_2]
      ,[racine_3]
      ,[famille_compte]
      ,[type_compte]
      ,[compte_tiers]
      ,[nom_tiers]
      ,[type_tiers]
      ,[classement_tiers]
      ,[pays_tiers]
      ,[libelle_ecriture]
      ,[montant_ht]
      ,[sens_code]
      ,[sens_libelle]
      ,[montant_debit]
      ,[montant_credit]
      ,[solde_signe]
      ,[code_lettrage]
      ,[est_lettre]
      ,[id]
      ,[compte_debut]
      ,[compte_fin]
      ,[type_classe]
      ,[categorie_bi]
      ,[sous_categorie]
      ,[kpi_tags]
      ,[utilisateur_creation]
      ,[date_creation_saisie]
      ,[date_modification]
      ,[watermark_sync]
  FROM [dbo].[VW_GRAND_LIVRE_GENERAL]

GO


USE [BIJOU]
GO

SELECT [Code_Immobilisation]
      ,[Designation]
      ,[Complement]
      ,[Code_Famille]
      ,[Libelle_Famille]
      ,[Code_Fournisseur]
      ,[Compte_Immo]
      ,[Date_Acquisition]
      ,[Date_Mise_En_Service]
      ,[Annee_Acquisition]
      ,[Valeur_Acquisition]
      ,[Dotations_Eco_Cumul]
      ,[Dotations_Fiscal_Cumul]
      ,[Valeur_Nette_Comptable]
      ,[Taux_Amort_Cumul_Pct]
      ,[Mode_Amort_Code]
      ,[Mode_Amort_Libelle]
      ,[Duree_Annees]
      ,[Duree_Mois_Compl]
      ,[Duree_Totale_Mois]
      ,[Etat_Code]
      ,[Etat_Libelle]
      ,[Quantite]
      ,[Observation]
      ,[Type_Amort]
      ,[Annee_Amort]
      ,[Taux_Amort_Annee]
      ,[Watermark_Sync]
  FROM [dbo].[VW_IMMOBILISATIONS]

GO


USE [BIJOU]
GO

SELECT [Timestamp_Calcul]
      ,[Annee_Courante]
      ,[Mois_Courant]
      ,[CA_Annuel_N]
      ,[CA_Annuel_N1]
      ,[Croissance_CA_Pct]
      ,[CA_Mois_Courant]
      ,[Solde_Tresorerie]
      ,[Creances_Clients]
      ,[Creances_En_Retard]
      ,[Pct_Creances_Retard]
      ,[Dettes_Fournisseurs]
      ,[Valeur_Stock]
      ,[Articles_En_Rupture]
      ,[BFR_Estime]
  FROM [dbo].[VW_KPI_SYNTESE]

GO


USE [BIJOU]
GO

SELECT [Table_Source]
      ,[Nb_Lignes]
      ,[Premiere_Date]
      ,[Derniere_Date]
      ,[Watermark_Max]
      ,[Derniere_Modif]
  FROM [dbo].[VW_METADATA_AGENT]

GO

USE [BIJOU]
GO

SELECT [Matricule]
      ,[Nom_Complet]
      ,[Date_Paie]
      ,[Annee]
      ,[Mois]
      ,[Periode]
      ,[Salaire_Brut]
      ,[Net_A_Payer]
      ,[Cotisations_Patronales]
      ,[Cout_Total_Employeur]
      ,[Watermark_Sync]
  FROM [dbo].[VW_PAIE]

GO


USE [BIJOU]
GO

SELECT [Reference_Article]
      ,[Designation]
      ,[Code_Famille]
      ,[Libelle_Famille]
      ,[Prix_Vente_HT]
      ,[Cout_Achat_Article]
      ,[Coefficient]
      ,[Taux_Marge_Pct]
      ,[Code_Depot]
      ,[Libelle_Depot]
      ,[Quantite_Stock]
      ,[Stock_Minimum]
      ,[Stock_Maximum]
      ,[Valeur_Stock]
      ,[Qte_Reservee]
      ,[Qte_Commandee]
      ,[Statut_Stock]
      ,[Unite_Vente]
      ,[Est_Sommeil]
      ,[Watermark_Sync]
  FROM [dbo].[VW_STOCKS]

GO



USE [BIJOU]
GO

SELECT [dt_jour]
      ,[annee]
      ,[mois]
      ,[semaine]
      ,[trimestre]
      ,[annee_mois]
      ,[annee_semaine]
      ,[cg_num]
      ,[classe_compte]
      ,[racine_2]
      ,[racine_3]
      ,[cg_intitule]
      ,[type_classe]
      ,[categorie_bi]
      ,[sous_categorie]
      ,[kpi_tags]
      ,[total_debit]
      ,[total_credit]
      ,[solde_net]
      ,[nb_ecritures]
      ,[ca_ht]
      ,[achats]
      ,[charges_personnel]
      ,[dotations_amort]
      ,[charges_financieres]
      ,[resultat_net]
      ,[ca_ttc]
      ,[marge_brute]
      ,[taux_marge_brute]
      ,[ebitda]
      ,[resultat_net_comptable]
      ,[ratio_charges_ca]
      ,[ca_n_1]
      ,[ca_cum_ytd]
      ,[variation_ca_n_vs_n1]
  FROM [dbo].[VW_FINANCE_GENERAL]

GO


USE [BIJOU]
GO

SELECT [EC_No]
      ,[EC_Date]
      ,[CG_Num]
      ,[CG_Intitule]
      ,[EC_Piece]
      ,[Libelle_Operation]
      ,[CT_Num]
      ,[Nom_Tiers]
      ,[Encaissement]
      ,[Decaissement]
      ,[Flux_Net]
      ,[Solde_Tresorerie_Net_Global]
      ,[Solde_Par_Compte]
      ,[Prevision_30j]
      ,[Prevision_60j]
      ,[Prevision_90j]
      ,[BFR]
      ,[TFT]
      ,[Evolution_Dettes_Creances_Treso]
      ,[EC_Lettrage]
      ,[cbCreateur]
      ,[cbMarq]
  FROM [dbo].[VW_TRESORERIE]

GO


