---
title: Design System
description: Shadcn/UI, Tailwind tokens, thème dark/light et composants Cockpit
---

# Design System

Le design system de l'Admin Cockpit repose sur **Shadcn/UI** (composants Radix UI pré-stylés) et **Tailwind CSS** avec des tokens CSS personnalisés.

## Tokens CSS (variables)

Les couleurs sont définies via des variables CSS HSL dans `src/index.css` :

=== "Mode Dark (défaut)"
    ```css
    .dark {
      --background: 224 71% 4%;      /* #020817 — fond principal */
      --foreground: 213 31% 91%;     /* #e2e8f0 — texte principal */
      --card: 224 71% 4%;            /* fond des cartes */
      --primary: 217.2 91.2% 59.8%; /* #3b82f6 — bleu accent */
      --primary-foreground: 222.2 47.4% 11.2%;
      --secondary: 222.2 47.4% 11.2%;
      --muted: 223 47% 11%;          /* fond muted */
      --muted-foreground: 215.4 16.3% 56.9%;
      --border: 216 34% 17%;         /* bordures */
      --sidebar: 222 47% 6%;         /* fond sidebar */
    }
    ```

=== "Mode Light"
    ```css
    :root {
      --background: 0 0% 100%;       /* blanc */
      --foreground: 222.2 84% 4.9%; /* noir */
      --primary: 221.2 83.2% 53.3%; /* bleu */
      --muted: 210 40% 96.1%;
      --border: 214.3 31.8% 91.4%;
      --sidebar: 0 0% 98%;
    }
    ```

!!! tip "Cohérence des couleurs"
    Utilisez **toujours** les variables CSS (ex: `bg-background`, `text-foreground`, `border-border`)
    plutôt que des couleurs hardcodées. Cela garantit la compatibilité dark/light mode.

---

## Typographie

| Usage | Classe Tailwind | Font |
|-------|----------------|------|
| Police principale | `font-sans` | Inter |
| Code / monospace | `font-mono` | JetBrains Mono (docs uniquement) |
| Titres principaux | `text-3xl font-bold tracking-tight` | Inter 700 |
| Labels | `text-sm font-semibold` | Inter 600 |
| Corps de texte | `text-sm text-muted-foreground` | Inter 400 |

---

## Composants UI (Shadcn/UI)

Tous les composants sont dans `src/components/ui/` et basés sur **Radix UI** :

| Composant | Fichier | Usage |
|-----------|---------|-------|
| `Button` | `button.tsx` | CTA principaux et secondaires |
| `Input` | `input.tsx` | Champs de formulaire |
| `Label` | `label.tsx` | Étiquettes accessibles |
| `Card` | `card.tsx` | Conteneurs de données |
| `Dialog` | `dialog.tsx` | Modals (create/edit) |
| `AlertDialog` | `alert-dialog.tsx` | Confirmation destructive |
| `DropdownMenu` | `dropdown-menu.tsx` | Menus contextuels |
| `Select` | `select.tsx` | Sélection simple |
| `Badge` | `badge.tsx` | Status tags |
| `Avatar` | `avatar.tsx` | Avatars utilisateurs |
| `Table` | `table.tsx` | Tables de données |
| `Toast` | `toast.tsx` + `toaster.tsx` | Notifications |
| `Skeleton` | `skeleton.tsx` | Loading placeholders |
| `Switch` | `switch.tsx` | Toggle on/off |
| `Checkbox` | `checkbox.tsx` | Sélection multiple |
| `Separator` | `separator.tsx` | Diviseurs visuels |

---

## Utilitaire `cn()`

La fonction `cn()` dans `src/lib/utils.ts` fusionne les classes Tailwind intelligemment :

```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<Button className={cn(
  "base-class",
  isActive && "active-class",
  disabled && "opacity-50"
)} />
```

---

## Composants partagés

### `DataTable`

Table complète avec tri, filtrage et pagination via **TanStack Table v8** :

```typescript
<DataTable
  columns={columns}    // ColumnDef<T>[]
  data={users}         // T[]
  searchKey="email"    // Colonne de recherche
/>
```

### `LoadingSpinner`

```typescript
<LoadingSpinner />            // Inline spinner
<LoadingSpinner fullScreen /> // Overlay plein écran
```

### `ConfirmDialog`

```typescript
<ConfirmDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Supprimer l'organisation ?"
  description="Cette action est irréversible."
  onConfirm={handleDelete}
  variant="destructive"
/>
```

---

## Thème Dark/Light (`ThemeProvider`)

```typescript
// Utilisation du hook
const { theme, toggleTheme, setTheme } = useTheme();

// Accès dans n'importe quel composant
<Button onClick={toggleTheme}>
  {theme === 'dark' ? <Sun /> : <Moon />}
</Button>
```

**Persistance :** `localStorage.getItem('theme')` — défaut : `'dark'`

**Application :** La classe `dark` est ajoutée/retirée sur `document.documentElement`.

---

## Internationalisation (i18n)

```typescript
// Utilisation dans les composants
const { t } = useTranslation();

<h2>{t('auth.welcome')}</h2>
<Button>{t('common.save')}</Button>
```

**Langues supportées :** Français (`fr`) — défaut, Anglais (`en`)

**Persistance :** `localStorage.getItem('language')`

**Toggle langue :** Via le `Header` → bouton FR/EN

### Clés de traduction (extrait)

```typescript
// fr.ts
export const fr = {
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    create: 'Créer',
    loading: 'Chargement...',
    confirm: 'Confirmer',
  },
  auth: {
    welcome: 'Bon retour',
    subtitle: 'Connectez-vous à votre espace administration',
    email: 'Email',
    password: 'Mot de passe',
    signIn: 'Se connecter',
    invalidCredentials: 'Email ou mot de passe incorrect',
  },
  nav: {
    dashboard: 'Tableau de bord',
    organizations: 'Organisations',
    users: 'Utilisateurs',
    roles: 'Rôles & Permissions',
    agents: 'Agents',
    auditLogs: 'Logs d\'audit',
    health: 'État du système',
  },
  // ... 150+ clés
};
```

---

## Icônes (Lucide React)

```typescript
import { Users, Building2, Shield, Activity, LogOut } from 'lucide-react';

<Users className="h-5 w-5" />
<Building2 className="h-4 w-4 text-muted-foreground" />
```

Convention de taille : `h-4 w-4` (small), `h-5 w-5` (medium), `h-6 w-6` (large)

---

## Utilitaires

```typescript
// src/lib/utils.ts

// Formater une date en locale
formatDate('2026-03-02T10:00:00Z', 'fr-FR')
// → "2 mars 2026 à 10:00"

// Temps relatif
formatRelativeTime('2026-03-02T10:00:00Z')
// → "5 min" | "2h" | "3j"

// Initiales d'un utilisateur
getInitials('Jean', 'Dupont')  // → "JD"
getInitials(undefined, undefined)  // → "?"

// Couleur de statut (agents)
getStatusColor('online')   // → "bg-green-500"
getStatusColor('offline')  // → "bg-gray-500"
getStatusColor('error')    // → "bg-red-500"
getStatusColor('pending')  // → "bg-yellow-500"
```

---

## Scrollbar personnalisée

```css
/* src/index.css — dark mode */
.dark ::-webkit-scrollbar { width: 8px; }
.dark ::-webkit-scrollbar-track { background: hsl(var(--background)); }
.dark ::-webkit-scrollbar-thumb { background: hsl(var(--muted)); border-radius: 4px; }
.dark ::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground)); }
```
