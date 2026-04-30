# Routes SuperAdmin cross-org

## Principe

Le `TenantGuard` injecte `organizationId` dans chaque requête à partir du JWT de l'utilisateur connecté. Pour un **superadmin**, ce champ est `undefined` — ce qui entraîne des filtres Prisma invalides (`WHERE organizationId = undefined`) sur les routes standard.

**Stratégie adoptée** : ajouter des routes dédiées `/admin/<ressource>` qui opèrent **sans filtre `organizationId`** (cross-organisation). Les routes non-admin restent inchangées et continuent d'assurer l'isolation tenant.

---

## Routes ajoutées dans `AdminController`

### Agents

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/admin/agents/generate-token` | Générer un token pour n'importe quelle organisation (body: `organizationId` requis) |
| `GET` | `/admin/agents/:id` | Détail d'un agent (toutes orgs) |
| `GET` | `/admin/agents/:id/logs` | Logs paginés de l'agent |
| `GET` | `/admin/agents/:id/jobs` | Jobs SQL (paginés, filtrables par statut/search) |
| `GET` | `/admin/agents/:id/job-stats` | Statistiques jobs : PENDING / RUNNING / COMPLETED / FAILED / total |
| `POST` | `/admin/agents/:id/revoke` | Révoquer le token |
| `POST` | `/admin/agents/:id/regenerate-token` | Regénérer le token |
| `POST` | `/admin/agents/:id/test-connection` | Tester la connexion SQL via WebSocket (utilise `AgentsService.executeRealTimeQuery`) |
| `DELETE` | `/admin/agents/:id` | Supprimer l'agent |

**Cas particulier `test-connection`** : le superadmin n'a pas d'`organizationId` injecté par le guard. Le contrôleur récupère l'agent en DB (`adminService.getAdminAgentById`) pour lire son `organizationId` réel, puis le passe à `agentsService.executeRealTimeQuery`.

### Logs d'audit

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/admin/audit-logs` | Liste paginée (params: `userId`, `event`, `events`, `startDate`, `endDate`, `limit`, `offset`) |
| `GET` | `/admin/audit-logs/:id` | Détail d'un log d'audit |

### Rôles

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/admin/roles` | Tous les rôles de toutes les organisations |
| `GET` | `/admin/roles/:id` | Détail d'un rôle |
| `POST` | `/admin/roles` | Créer un rôle (body: `organizationId`, `name`, `permissionIds`) |
| `PATCH` | `/admin/roles/:id` | Modifier nom / description / permissions |
| `DELETE` | `/admin/roles/:id` | Supprimer (bloqué si `isSystem = true`) |

---

## Impact Frontend (`admin-cockpit`)

Tous les appels API du cockpit admin ont été remappés vers les routes `/admin/` dans `src/api/index.ts`.

### `GenerateTokenModal`

- Suppression du champ `force` (non supporté par la nouvelle route)
- Ajout d'un **sélecteur d'organisation** (alimenté par `useOrganizations()`)
- Body envoyé : `{ organizationId, name? }`

### `RoleFormModal`

- En mode **création** : sélecteur d'organisation visible
- En mode **édition** : `organizationId` lu depuis `role.organizationId` (champ masqué)
- Body envoyé en création : `{ organizationId, name, description?, permissionIds }`

---

## Modules importés dans `AdminModule`

```typescript
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    NotificationsModule,
    AgentReleasesModule,
    AgentsModule,   // ← Ajouté pour AgentsService (test-connection) et AgentsGateway
  ],
  controllers: [AdminController],
  providers: [AdminService, CockpitGateway],
})
export class AdminModule {}
```

---

## Méthodes `AdminService` correspondantes

| Méthode | Description |
|---------|-------------|
| `getAdminAgentById(id)` | `prisma.agent.findUnique` sans filtre org |
| `getAdminAgentLogs(agentId, opts)` | Pagination sur `agentLog` |
| `getAdminAgentJobs(agentId, opts)` | Pagination + filtre statut/search sur `agentJob` |
| `getAdminAgentJobStats(agentId)` | `groupBy status` sur `agentJob` |
| `revokeAdminAgentToken(id)` | Met `isRevoked=true`, `status='pending'` |
| `regenerateAdminAgentToken(id)` | Nouveau token HMAC, mise à jour DB |
| `generateAgentTokenForOrg(orgId, adminId, opts)` | Création agent avec token pour une org donnée |
| `getAuditLogById(id)` | `prisma.auditLog.findUnique` |
| `listAllRoles()` | `prisma.role.findMany` toutes orgs |
| `getAdminRoleById(id)` | `prisma.role.findUnique` |
| `createRoleForOrg(orgId, dto, adminId)` | Création rôle avec permissions |
| `updateAdminRole(id, dto, adminId)` | Update nom/desc/permissions |
| `deleteAdminRole(id, adminId)` | Vérifie `!isSystem`, puis delete |
| `getStorageMigrationStatus()` | Compte les fichiers avec URL locale dans `Bug.attachments` et `AgentRelease.fileUrl` |
| `migrateLocalToMinio()` | Remplace `APP_URL/UPLOAD_DIR/` par `R2_PUBLIC_URL/` dans les deux modèles |

---

## Routes stockage — `/admin/storage`

Ces routes permettent de migrer les URLs de fichiers locaux vers MinIO depuis l'interface Admin Cockpit.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/admin/storage/migration-status` | Statut : nombre de fichiers locaux restants |
| `POST` | `/admin/storage/migrate-local-to-minio` | Met à jour les URLs en base de données |

> **Interface graphique :** Admin Cockpit → Paramètres → Stockage
