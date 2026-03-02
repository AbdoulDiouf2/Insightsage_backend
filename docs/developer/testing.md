---
title: Suite de tests
description: Tests Jest (Backend) et Vitest (Frontend) — configuration et exemples
---

# Suite de tests

## Backend — Jest

### Configuration

```json
// package.json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

### Commandes

```bash
npm run test          # Tests en mode watch
npm run test:cov      # Avec couverture Istanbul
npm run test:e2e      # Tests end-to-end (jest-e2e.json)
npm run test:debug    # Debug avec Chrome DevTools
```

### Structure d'un test unitaire

```typescript
// src/agents/agents.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: PrismaService,
          useValue: {
            agent: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('generateAgentToken', () => {
    it('should generate a token with isag_ prefix', async () => {
      const mockAgent = { id: 'uuid', token: 'isag_abc123', name: 'test-agent' };
      jest.spyOn(prisma.agent, 'create').mockResolvedValue(mockAgent as any);

      const result = await service.generateAgentToken('org-uuid', { name: 'test-agent' });

      expect(result.token).toMatch(/^isag_/);
      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-uuid' }),
        }),
      );
    });

    it('should throw if active agent exists without force flag', async () => {
      jest.spyOn(prisma.agent, 'findFirst').mockResolvedValue({ id: 'existing' } as any);

      await expect(
        service.generateAgentToken('org-uuid', { force: false }),
      ).rejects.toThrow('Agent déjà actif');
    });
  });

  describe('processHeartbeat', () => {
    it('should update agent status to online', async () => {
      jest.spyOn(prisma.agent, 'findUnique').mockResolvedValue({
        id: 'uuid',
        token: 'isag_test',
        isRevoked: false,
      } as any);
      jest.spyOn(prisma.agent, 'update').mockResolvedValue({ status: 'online' } as any);

      const dto = { agentToken: 'isag_test', status: 'online', errorCount: 0 };
      await service.processHeartbeat(dto);

      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'online', lastSeen: expect.any(Date) }),
        }),
      );
    });

    it('should set status to error when errorCount > 0', async () => {
      jest.spyOn(prisma.agent, 'findUnique').mockResolvedValue({
        id: 'uuid', token: 'isag_test', isRevoked: false,
      } as any);
      jest.spyOn(prisma.agent, 'update').mockResolvedValue({ status: 'error' } as any);

      await service.processHeartbeat({ agentToken: 'isag_test', errorCount: 3 });

      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'error' }),
        }),
      );
    });
  });
});
```

### Test du masquage PII

```typescript
// src/logs/audit-log.service.spec.ts
describe('AuditLogService - sanitizePayload', () => {
  it('should mask email addresses', () => {
    const payload = { email: 'jean.dupont@acme.com' };
    const result = service['sanitizePayload'](payload);
    expect(result.email).toBe('j***@acme.com');
  });

  it('should redact passwords', () => {
    const payload = { password: 'SecretPass123!', passwordHash: 'bcrypt...' };
    const result = service['sanitizePayload'](payload);
    expect(result.password).toBe('[REDACTED]');
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('should recursively sanitize nested objects', () => {
    const payload = {
      user: { email: 'test@acme.com', name: 'Jean' },
    };
    const result = service['sanitizePayload'](payload);
    expect((result.user as any).email).toBe('t***@acme.com');
    expect((result.user as any).name).toBe('Jean');
  });

  it('should not throw on null values', () => {
    expect(() => service['sanitizePayload']({ key: null })).not.toThrow();
  });
});
```

---

## Frontend — Vitest

### Configuration

```typescript
// vite.config.ts (extrait test)
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

### Setup

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

### Commandes

```bash
npm run test         # Vitest en mode watch
npm run test:run     # Tests en une passe (CI)
npm run test:coverage # Couverture Istanbul/V8
```

### Utilitaire de rendu (`src/test/utils.tsx`)

```typescript
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}
```

### Exemple — Test de modal

```typescript
// src/features/organizations/__tests__/CreateOrganizationModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { CreateOrganizationModal } from '../CreateOrganizationModal';

describe('CreateOrganizationModal', () => {
  const mockOnClose = vi.fn();

  it('renders form fields', () => {
    renderWithProviders(
      <CreateOrganizationModal open={true} onClose={mockOnClose} />
    );

    expect(screen.getByLabelText(/nom de l'organisation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email administrateur/i)).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    renderWithProviders(
      <CreateOrganizationModal open={true} onClose={mockOnClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /créer/i }));

    await waitFor(() => {
      expect(screen.getByText(/nom requis/i)).toBeInTheDocument();
    });
  });

  it('calls API on valid form submission', async () => {
    const user = userEvent.setup();
    // Mock API
    vi.mock('@/api', () => ({
      organizationsApi: {
        createClient: vi.fn().mockResolvedValue({ data: { organizationId: 'uuid' } }),
      },
    }));

    renderWithProviders(
      <CreateOrganizationModal open={true} onClose={mockOnClose} />
    );

    await user.type(screen.getByLabelText(/nom/i), 'Acme Corp');
    await user.type(screen.getByLabelText(/email/i), 'admin@acme.com');
    await user.click(screen.getByRole('button', { name: /créer/i }));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
```

### Test utilitaires (`src/lib/__tests__/utils.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { cn, formatDate, getInitials, getStatusColor } from '../utils';

describe('cn()', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');  // twMerge résout le conflit
    expect(cn('text-sm', false && 'text-lg')).toBe('text-sm');
  });
});

describe('getInitials()', () => {
  it('returns uppercase initials', () => {
    expect(getInitials('Jean', 'Dupont')).toBe('JD');
  });
  it('returns ? when undefined', () => {
    expect(getInitials()).toBe('?');
  });
});

describe('getStatusColor()', () => {
  it('returns correct colors', () => {
    expect(getStatusColor('online')).toBe('bg-green-500');
    expect(getStatusColor('error')).toBe('bg-red-500');
    expect(getStatusColor('unknown')).toBe('bg-gray-500');
  });
});
```

---

## Couverture cible

| Module | Cible |
|--------|-------|
| `auth/auth.service` | ≥ 90% |
| `agents/agents.service` | ≥ 85% |
| `logs/audit-log.service` | ≥ 95% (PII critique) |
| `onboarding/onboarding.service` | ≥ 80% |
| Frontend utils | ≥ 95% |
| Frontend modals | ≥ 70% |

```bash
# Rapport de couverture
npm run test:cov
# → Rapport dans coverage/lcov-report/index.html
```
