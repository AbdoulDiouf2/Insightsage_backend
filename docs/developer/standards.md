---
title: Standards de développement
description: Conventions de code, linting, formatting et workflow Git
---

# Standards de développement

## Architecture décisionnelle

### Principes fondamentaux

| Principe | Application |
|----------|-------------|
| **Single Responsibility** | Un module = un domaine métier |
| **Dependency Injection** | NestJS DI sur tous les services |
| **Fail-Safe** | AuditLog ne propage jamais d'erreur |
| **Security by Default** | JwtAuthGuard + TenantGuard globaux |
| **PII by Default** | Masquage systématique dans les logs |

---

## Backend (NestJS)

### Structure d'un module

```
src/feature/
├── feature.module.ts     # Imports, controllers, providers, exports
├── feature.service.ts    # Logique métier
├── feature.controller.ts # Routing HTTP + guards
└── dto/
    ├── create-feature.dto.ts
    └── update-feature.dto.ts
```

### Conventions de nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Fichiers | `kebab-case` | `audit-log.service.ts` |
| Classes | `PascalCase` | `AuditLogService` |
| Méthodes | `camelCase` | `findAllByOrganization()` |
| Variables | `camelCase` | `organizationId` |
| Constantes | `UPPER_SNAKE_CASE` | `SAFE_USER_SELECT` |
| DTOs Admin | Préfixe `Admin` | `AdminUpdateUserDto` |
| DB tables | `snake_case` (@@map) | `audit_logs`, `user_roles` |

### Pattern Controller

```typescript
@Controller('feature')
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get()
  @RequirePermissions({ action: 'read', resource: 'feature' })
  @UseGuards(PermissionsGuard)
  async findAll(@OrganizationId() orgId: string) {
    return this.featureService.findAllByOrg(orgId);
  }

  @Post()
  @RequirePermissions({ action: 'manage', resource: 'feature' })
  @UseGuards(PermissionsGuard)
  async create(
    @OrganizationId() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFeatureDto,
  ) {
    return this.featureService.create(orgId, userId, dto);
  }
}
```

### Pattern Service

```typescript
@Injectable()
export class FeatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService, // @Global — injecté automatiquement
  ) {}

  async findAllByOrg(orgId: string) {
    return this.prisma.feature.findMany({
      where: { organizationId: orgId }, // TOUJOURS filtrer par orgId
    });
  }

  async create(orgId: string, userId: string, dto: CreateFeatureDto) {
    const result = await this.prisma.feature.create({
      data: { ...dto, organizationId: orgId },
    });

    // Audit log — non-bloquant
    await this.auditLog.log({
      event: 'feature_created',
      userId,
      organizationId: orgId,
      payload: { featureId: result.id },
    });

    return result;
  }
}
```

### DTOs et validation

```typescript
import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeatureDto {
  @ApiProperty({ description: 'Nom de la feature' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  organizationId: string;
}
```

---

## Frontend (React)

### Structure d'une feature

```typescript
// Pattern Page → Hook → API

// 1. API (src/api/index.ts)
export const featureApi = {
  getAll: () => api.get<Feature[]>('/feature'),
  create: (data: CreateFeatureDto) => api.post<Feature>('/feature', data),
};

// 2. Hook (src/hooks/use-api.ts)
export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: async () => {
      const resp = await featureApi.getAll();
      return resp.data;
    },
  });
}

// 3. Page (src/features/feature/FeaturePage.tsx)
export function FeaturePage() {
  const { data, isLoading, error } = useFeatures();
  // ...
}
```

### Conventions TypeScript strict

```typescript
// ✅ Bon — interface explicite
interface CreateFeatureProps {
  onSuccess: (id: string) => void;
  organizationId: string;
}

// ❌ Mauvais — any interdit
const data: any = response.data;

// ✅ Bon — type guard
const errorMessage = (err as { response?: { data?: { message?: string } } })
  ?.response?.data?.message ?? 'Erreur inconnue';
```

### Organisation des imports

```typescript
// 1. React/Libraries
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Hooks internes
import { useAuth } from '@/features/auth/AuthContext';
import { useOrganizations } from '@/hooks/use-api';

// 3. Composants
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/DataTable';

// 4. Types
import type { Organization } from '@/types';
```

---

## ESLint Configuration

=== "Backend (eslint.config.mjs)"
    ```javascript
    import eslint from '@eslint/js';
    import tseslint from 'typescript-eslint';

    export default tseslint.config(
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      {
        rules: {
          '@typescript-eslint/no-explicit-any': 'error',
          '@typescript-eslint/no-unused-vars': 'error',
          'no-console': ['warn', { allow: ['error', 'warn'] }],
        },
      },
    );
    ```

=== "Frontend"
    ```javascript
    // Extends: react-hooks, react-refresh
    {
      rules: {
        'react-hooks/exhaustive-deps': 'warn',
        'react-refresh/only-export-components': 'warn',
      }
    }
    ```

---

## Prettier Configuration (Backend)

```json
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

---

## Git Workflow

### Branches

```
main           → Production (protégée)
develop        → Intégration (branche de base pour les PR)
feature/*      → Nouvelles fonctionnalités
fix/*          → Corrections de bugs
hotfix/*       → Corrections urgentes production
```

### Convention de commits (Conventional Commits)

```
<type>(<scope>): <description>

Types : feat, fix, docs, refactor, test, chore, perf
Scope : auth, agents, onboarding, frontend, db, ci

Exemples :
feat(agents): add token expiry warning (isExpiringSoon field)
fix(auth): refresh token rotation on concurrent requests
docs(api): add pagination examples to audit-logs endpoint
refactor(users): extract SAFE_USER_SELECT as shared constant
test(onboarding): add step5 inviteLater scenario
chore(deps): upgrade prisma to 7.4.2
```

### Husky Pre-commit

```bash
# .husky/pre-commit
npm run lint
npm run format -- --check
```

Si le pre-commit échoue :
```bash
# Corriger automatiquement
npm run lint   # ESLint avec --fix
npm run format # Prettier

# Re-commit
git add .
git commit -m "fix: ..."
```

---

## Sécurité du code

### Vérifications obligatoires

- [ ] Aucune query Prisma sans `where: { organizationId }` dans les services non-admin
- [ ] Aucun champ sensible (`passwordHash`, `hashedRefreshToken`) dans les réponses API
- [ ] Tout nouvel endpoint public doit être annoté `@Public()`
- [ ] Tout endpoint restreignant par permission utilise `@RequirePermissions()` + `@UseGuards(PermissionsGuard)`
- [ ] Les secrets en `.env` ne sont jamais committés (`.gitignore` protège `.env.*`)
- [ ] Les inputs utilisateur sont validés via DTOs (`class-validator`)

### Dépendances

```bash
# Auditer les vulnérabilités
npm audit

# Mettre à jour les dépendances mineures/patch
npm update

# Vérifier les dépendances obsolètes
npx npm-check-updates
```
