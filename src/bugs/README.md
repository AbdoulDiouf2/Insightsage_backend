# Module Bugs (Ticketing)

Ce module gère le cycle de vie des signalements technique de la plateforme Cockpit.

## Fonctionnalités
- Création de tickets avec capture automatique du contexte (OS, Browser, URL, Résolution).
- Génération d'ID séquentiels chronologiques : `BR-YYYYMMDD-XXX`.
- Gestion des pièces jointes via le `StorageService`.
- Système de commentaires internes et externes pour le suivi.

## Structure
- `/bugs.controller.ts` : Endpoints d'upload et de création.
- `/bugs.service.ts` : Logique de génération d'ID et de promotion des fichiers temporaires.
- `/dto/` : Validation des données d'entrée via class-validator.

## Workflow des fichiers
Lors de la création d'un bug, le service appelle `storageService.confirmUploads()` pour déplacer les images du dossier `temp/` vers un dossier définitif nommé par le `bugId`. Les fichiers sont renommés `bugId_index.ext`.
