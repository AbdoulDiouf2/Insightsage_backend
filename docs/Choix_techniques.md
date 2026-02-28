# Documentation Stack Technique – Raisonnement & Justification

*Pourquoi chaque choix technique pour InsightSage MVP Back-end. Phase 1 Architecture.*

## 🎯 Stack complète choisie

| Composant | Choix | Alternatives rejetées |
|-----------|-------|----------------------|
| Framework | **Nest.js** | FastAPI, Express |
| Langage | **TypeScript** | JavaScript, Python |
| DB App | **PostgreSQL** | MySQL, MongoDB |
| ORM | **Prisma** | TypeORM, Sequelize |
| Auth | **JWT + Passport** | Auth0, Session |
| Logs | **Winston** | Pino, Console |

## 1. Nest.js – Framework Backend Principal

### **Pourquoi Nest.js ?**
```
✅ PHASE 1 : Architecture modulaire native [file:1]
   → Modules = 1 par domaine (auth, dashboards, onboarding)
   → Guards/Interceptors = RBAC + middleware sécurisés

✅ PHASE 2 : Auth + RBAC prêt en 7 jours [file:1]
   → @nestjs/passport + guards custom = OAuth2/JWT
   → @casl/ability intégré pour permissions granulaires

✅ PHASE 3 : APIs dashboards/widgets [file:1]
   → OpenAPI/Swagger AUTO-GÉNÉRÉ → front client prêt
   → DTOs + class-validator = sécurité inputs 100%

✅ MAINTENANCE : TypeScript + Décorateurs = docs auto
```

### **Pourquoi pas FastAPI (recommandé cahier charges) ?**
```
❌ Moins mature écosystème Nest.js (RBAC, Swagger)
❌ Pydantic vs class-validator → moins intégré
❌ Python typing vs TS → moins strict pour SaaS multi-tenant
✅ Nest.js = 10x plus de modules métier prêts
```

## 2. TypeScript – Langage Principal

### **Pourquoi TypeScript ?**
```
✅ RBAC + Multi-tenant = typage FORT obligatoire
   → User.organizationId NON NULLABLE partout
   → DTOs typés = validation compile-time

✅ Prisma + Nest.js = magie TypeScript
   → Autocomplétion 100% entités → 0 erreur runtime

✅ MAINTENANCE 30 jours → docs auto → client front OK [file:1]
```

### **Pourquoi pas JavaScript pur ?**
```
❌ organizationId filter oublié = DATA LEAK
❌ Refacto DTOs = chaos sans typage
```

## 3. PostgreSQL 16.x – Base Application

### **Pourquoi PostgreSQL (PoC/MVP) ? **
```
✅ Cahier charges EXPLICITE : "Postgres pour PoC" [file:4]
✅ JSONB natif = layouts widgets (positions, config)
✅ Relations complexes = users → orgs → roles → dashboards
✅ Prisma support parfait → migrations auto
✅ Gratuit → illimité → scale facile → Supabase/Neon
```

### **Architecture données claire (NO DATA COPY) :**
```
CLIENTS : SQL Server Sage ←→ Agent On-Prem (Lecture seule locale)
↓ (HTTPS JSON - Aucun credential ERP transité)
TON BACK : PostgreSQL application (users/dashboards/metadata)
```

### **Pourquoi pas MySQL ?**
```
❌ JSON moins mature vs PostgreSQL JSONB
❌ CASCADE DELETE moins intuitif
❌ Prisma moins optimisé
```

## 4. Prisma – ORM Principal

### **Pourquoi Prisma ?**
```
✅ Schema déclaratif = doc DB vivante
✅ Migrations auto = Phase 1 → 1h setup
✅ Relations complexes RBAC = @relation() magique
✅ Raw SQL si besoin NLQ templates
✅ TypeScript généré = 0 erreur typage
```

**Exemple modèle User → Organization :**
```prisma
model User {
  id             String        @id @default(uuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id])
  @@index([organizationId])  // TOUTES queries filtrées auto
}
```

## 5. JWT + Passport – Authentification

### **Pourquoi JWT OAuth2 ? **
```
✅ Cahier charges EXPLICITE : "OAuth2/JWT" [file:1]
✅ Stateless = scale horizontal facile
✅ Guards Nest.js = middleware RBAC puissant
✅ Refresh tokens = sécurité pro
```

### **Guards personnalisés :**
```typescript
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('dashboards')
export class DashboardsController {}
```

## 6. Winston – Logging & Monitoring

### **Pourquoi Winston ?**
```
✅ Logs structurés JSON = audit trail Phase 4 [file:1]
✅ Rotation daily = traçabilité 1 an
✅ Levels (error, warn, info, debug) = prod-ready
✅ Intégration Sentry = erreurs → Slack
```

**Exemple audit log :**
```json
{
  "event": "widget_added",
  "userId": "uuid",
  "organizationId": "uuid",
  "payload": { "dashboardId": "uuid", "widgetId": "uuid" },
  "ip": "1.2.3.4"
}
```

## 7. Redis – Cache & Jobs (Phase 4)

### **Pourquoi Redis ?**
```
✅ Cache NLQ results = TtI <30s [file:4]
✅ BullMQ jobs = exports CSV asynchrones
✅ Rate limiting = sécurité DDoS
✅ Sessions refresh tokens
```

## 📊 Comparatif PostgreSQL vs SQL Server

| Critère | PostgreSQL (TON BACK SaaS) | SQL Server (CHEZ LE CLIENT) |
|---------|----------------------|---------------------------|
| **Rôle** | Métadonnées (Users, Orgs, Layouts, Logs) | Données métiers (CA, DMP, Factures) |
| **Sécurité** | Ne stocke JAMAIS les credentials ERP | Sécurisé localement par l'Agent |
| **Accès** | API REST Publique sécurisée | Lecture seule stricte via Agent On-Prem |
| **JSON** | JSONB natif (layouts widgets) | Retourne du JSON structuré via pyodbc |
| **Stockage**| Hébergé dans ton Cloud | Reste sur les serveurs du client |

## 🎯 Résumé décisions alignées cahier charges

```
✅ [file:1] Phase 1-5 : 30 jours → Nest.js modulaire
✅ [file:4] Postgres PoC → DWH staging + app DB
✅ [file:1] OAuth2/JWT + RBAC → Guards Nest.js
✅ [file:3] Multi-tenant → organizationId EVERYWHERE
✅ [file:4] TtI <30s → Redis cache + indexes
```

**Copie-colle dans `docs/CHOIX_TECHNIQUES.md` → client approuve Phase 1 !**

**Prochaine étape : `schema.prisma` complet ou `main.ts` bootstrap ?** 🚀