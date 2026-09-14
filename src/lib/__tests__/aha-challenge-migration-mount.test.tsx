import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrateAhaChallenge } from '@/lib/aha-challenge-migration';

vi.mock('@/lib/aha-challenge-migration', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  migrateAhaChallenge: vi.fn(),
}));

const migrate = vi.mocked(migrateAhaChallenge);

describe('aha challenge migration mount timing', () => {
  it('calls migration once in logged-in app state', () => {
    migrate.mockResolvedValue(false);
    const source = readFileSync('src/hooks/use-aha-challenge-migration.ts', 'utf8');
    expect(source).toMatch(/void\s+migrateAhaChallenge\(user\)/);
    expect(readFileSync('src/app/[locale]/page.tsx', 'utf8')).toContain('useAhaChallengeMigration(user, t)');
    expect(source).toContain("t('ahaMoment.migratedToast', { defaultValue: 'Your first guard challenge is ready 🛡️' })");
  });

  it('uses the required lightweight toast duration', () => {
    const source = readFileSync('src/hooks/use-aha-challenge-migration.ts', 'utf8');
    expect(source).toMatch(/'success',\s*1500/);
  });
});
