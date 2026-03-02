# Prisma Module

Ce module centralise la gestion de l'ORM Prisma pour l'application NestJS.

## Fonctionnement
- Il expose `PrismaService` qui s'assure d'initier correctement la connexion à la base de données PostgreSQL au démarrage (`onModuleInit()`).
