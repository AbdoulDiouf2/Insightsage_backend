# AdminJS Panel - InsightSage

## ⚠️ Status: Temporairement Désactivé

AdminJS v7 est **ESM-only** et incompatible avec NestJS (CommonJS). Le module est désactivé en attendant une solution.

## Alternative : Prisma Studio ✅

Utilise Prisma Studio pour gérer les données en local :

```bash
npx prisma studio
```

**Ouvre** : http://localhost:5555

### Fonctionnalités Prisma Studio :
- ✅ Visualiser toutes les tables
- ✅ CRUD sur toutes les entités
- ✅ Filtres et recherche
- ✅ Relations visibles
- ✅ Export données

---

## Alternative 2 : Swagger UI

L'API Swagger est disponible pour tester tous les endpoints :

**URL** : http://localhost:3000/api

### Pour créer un client (organisation + DAF) :

1. D'abord, créer un superadmin manuellement via Prisma Studio
2. Ou utiliser le seed : `npx ts-node prisma/seed.ts`
3. Puis utiliser `POST /api/admin/clients` via Swagger

---

## Réactiver AdminJS (Future)

Quand NestJS supportera ESM nativement ou quand un workaround stable existera :

1. Décommenter dans `app.module.ts` :
```typescript
import { AdminPanelModule } from './admin-panel/admin-panel.module';
// ...
AdminPanelModule,
```

2. Configurer les variables d'env :
```env
ADMIN_EMAIL="admin@insightsage.com"
ADMIN_PASSWORD="admin123!"
ADMIN_COOKIE_SECRET="super-secret-32chars"
ADMIN_SESSION_SECRET="super-secret-32chars"
```

