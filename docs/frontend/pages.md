---
title: Pages & Navigation
description: Toutes les pages du dashboard et leur structure fonctionnelle
---

# Pages & Navigation

## Navigation principale (Sidebar)

```
🎛️ Cockpit Administration
├── 📊 Tableau de bord      → /dashboard
├── 🏢 Organisations        → /organizations
├── 👥 Utilisateurs         → /users
├── 🛡️ Rôles & Permissions  → /roles
├── 📋 Plans d'abonnement   → /subscription-plans
├── 🤖 Agents               → /agents
├── 📜 Logs d'audit         → /audit-logs
└── ❤️ État du système      → /health
```

---

## Page : Tableau de bord (`/dashboard`)

**Composant :** `DashboardPage.tsx`
**Hook :** `useDashboardStats()` → `GET /admin/dashboard-stats`

Affiche les statistiques globales de la plateforme :

- **KPI Cards** : Total organisations, total utilisateurs, agents online/error/offline
- **Graphiques** : Activité des 7 derniers jours (area chart Recharts)

```typescript
// Données attendues de l'API
{
  totalOrganizations: 42,
  totalUsers: 318,
  agents: { online: 38, offline: 3, error: 1 },
  recentActivity: [...] // Derniers audit logs
}
```

---

## Page : Organisations (`/organizations`)

**Composants :** `OrganizationsPage.tsx`, `OrganizationDetailPage.tsx`, `CreateOrganizationModal.tsx`, `EditOrganizationModal.tsx`

### Liste (`/organizations`)

- Table avec colonnes : Nom, Secteur, Plan, Utilisateurs, Agents, Date création
- Recherche globale
- Bouton **Nouveau client** → `CreateOrganizationModal`

### Création (`CreateOrganizationModal`)

```typescript
// POST /admin/clients
{
  organizationName: string,
  adminEmail: string,
  adminFirstName: string,
  adminLastName: string
}
```

Valide via Zod, retourne le `resetToken` pour l'onboarding.

### Détail (`/organizations/:id`)

- Infos complètes de l'org (plan, Sage config, onboarding status)
- Onglets : Utilisateurs, Agents, Logs d'audit
- Bouton **Modifier** → `EditOrganizationModal`

---

## Page : Utilisateurs (`/users`)

**Composants :** `UsersPage.tsx`, `UserDetailPage.tsx`, `CreateUserModal.tsx`, `EditUserModal.tsx`, `InviteUserModal.tsx`

### Liste (`/users`)

- Table : Email, Nom, Organisation, Rôles, Statut (actif/inactif), Date
- Filtre par organisation et statut
- Boutons : **Créer** (direct) et **Inviter** (par email)

### Création directe (`CreateUserModal`)

```typescript
// POST /admin/users
{ email, password, firstName, lastName, organizationId, roleIds[] }
```

### Invitation (`InviteUserModal`)

```typescript
// POST /auth/invite
{ email, role, organizationId }
// → Génère un token d'invitation 7j
```

### Détail (`/users/:id`)

- Profil complet, rôles assignés
- Toggle actif/inactif
- Historique des connexions (logs)

---

## Page : Rôles & Permissions (`/roles`)

**Composants :** `RolesPage.tsx`, `RoleDetailPage.tsx`, `RoleFormModal.tsx`

### Liste (`/roles`)

- Rôles système (badge "Système") + rôles custom
- Colonnes : Nom, Description, Utilisateurs assignés, Permissions count
- Bouton **Nouveau rôle** (custom uniquement)

### Création/Édition (`RoleFormModal`)

```typescript
// POST /roles
{
  name: string,
  description?: string,
  permissionIds: string[]  // checklist des permissions disponibles
}
```

### Détail (`/roles/:id`)

- Liste des permissions avec leur `action:resource`
- Utilisateurs assignés à ce rôle
- Bouton Modifier (désactivé pour les rôles système)

---

## Page : Plans d'abonnement (`/subscription-plans`)

**Composants :** `SubscriptionPlansPage.tsx`, `SubscriptionPlanDetailPage.tsx`, `CreateSubscriptionPlanModal.tsx`, `EditSubscriptionPlanModal.tsx`

### Liste (`/subscription-plans`)

- Cartes de plans avec limites et prix
- Badge "Inactif" pour les plans désactivés
- Nombre d'organisations par plan (`_count.organizations`)

### Création/Édition

Formulaire avec tous les champs : nom, label, prix, limites, KPI packs, flags NLQ/reports, IDs Stripe.

---

## Page : Agents (`/agents`)

**Composants :** `AgentsPage.tsx`, `AgentDetailPage.tsx`, `GenerateTokenModal.tsx`, `RegenerateTokenModal.tsx`

### Liste (`/agents`)

**Auto-refresh toutes les 30 secondes** via `refetchInterval`.

- Table : Nom, Organisation, Statut (colored badge), Dernière vue, Lignes synchronisées
- Badge d'alerte pour les tokens expirant dans 7 jours
- Bouton **Générer un token** → `GenerateTokenModal`

### Statuts visuels

| Statut | Badge | Couleur |
|--------|-------|---------|
| `online` | 🟢 En ligne | Vert |
| `offline` | ⚫ Hors ligne | Gris |
| `error` | 🔴 Erreur | Rouge |
| `pending` | 🟡 En attente | Jaune |

### Génération de token (`GenerateTokenModal`)

```typescript
// POST /agents/generate-token
{ name?: string, force?: boolean }
// ⚠️ Token affiché UNE SEULE FOIS — copier immédiatement
```

### Détail (`/agents/:id`)

- Métriques : rows synced, error count, last error
- Token preview (masqué)
- Expiration info + alerte si < 7 jours
- Actions : Régénérer token, Révoquer

---

## Page : Logs d'audit (`/audit-logs`)

**Composants :** `AuditLogsPage.tsx`, `AuditLogFilters.tsx`

- Table paginée avec filtres dynamiques
- Filtre par : événement (select), utilisateur, plage de dates

**Filtres disponibles :**

```typescript
interface AuditLogFilters {
  userId?: string;
  event?: string;        // ex: "user_login"
  startDate?: string;    // ISO 8601
  endDate?: string;
  limit?: number;        // 10 | 25 | 50 | 100
  offset?: number;
}
```

- Chart : Distribution des types d'événements (pie chart Recharts)

---

## Page : État du système (`/health`)

**Composant :** `HealthPage.tsx`
**Hook :** `healthApi.check()` → `GET /health`

- Statut de l'API (online/degraded)
- Latence de réponse
- Statut de la connexion DB

---

## Page : Mon Profil (`/profile`)

**Composant :** `ProfilePage.tsx`

- Affiche les informations de l'utilisateur connecté (via `useAuth()`)
- Formulaire de mise à jour `firstName` / `lastName`
- Toggle langue (FR/EN)
- Toggle thème (dark/light)
- Bouton de déconnexion

---

## Page : Login (`/login`)

**Composant :** `LoginPage.tsx`

Design split-screen :

- **Colonne gauche (desktop)** : Branding Cockpit, texte marketing, stats (99.9% disponibilité, Secure Bridge Sage), image de fond `/login-bg.png` + gradients
- **Colonne droite** : Formulaire email/password avec gestion d'erreur animée

Fonctionnalités :
- Redirect automatique si déjà authentifié (`→ /dashboard`)
- Lien "Mot de passe oublié ?" → `/forgot-password`
- Support i18n complet

```typescript
// Gestion d'erreur avec type guard
const errorMessage = (err as { response?: { data?: { message?: string } } })
  ?.response?.data?.message;
setError(errorMessage || t('auth.invalidCredentials'));
```

---

## Layout principal (`MainLayout`)

```typescript
// Structure
<div className="flex h-screen">
  <Sidebar />          {/* Navigation latérale */}
  <div className="flex flex-col flex-1">
    <Header />         {/* Top bar: user menu, theme toggle, language */}
    <main>
      {children}       {/* Contenu de la page */}
    </main>
  </div>
</div>
```

**Header contient :**
- Titre de la page courante
- Toggle thème dark/light
- Toggle langue FR/EN
- Avatar utilisateur + dropdown (Profil, Déconnexion)

**Sidebar contient :**
- Logo Cockpit + titre
- Liens de navigation avec icônes Lucide
- Collapser sur mobile (overlay)
- Badge de version en bas
