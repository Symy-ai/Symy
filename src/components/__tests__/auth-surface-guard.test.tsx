import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const authSurfaces = [
  'src/app/[locale]/auth/login/page.tsx',
  'src/app/[locale]/auth/signup/page.tsx',
  'src/app/[locale]/auth/forgot-password/page.tsx',
  'src/app/[locale]/auth/reset-password/page.tsx',
  'src/components/auth-prompt-modal.tsx',
];

describe('auth surface green brand guard', () => {
  it.each(authSurfaces)('keeps legacy cyan and purple gradients out of %s', (surface) => {
    const source = readFileSync(join(root, surface), 'utf8');

    expect(source).not.toMatch(/from-cyan-500\s+to-purple/);
    expect(source).not.toMatch(/via-purple-500/);
    expect(source).not.toMatch(/#06b6d4/i);
  });

  it('positions the PWA as a green shopping companion', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'));

    expect(manifest.name).toContain('Green');
    expect(manifest.name).not.toContain('Inducement');
    expect(manifest.description).not.toMatch(/inducement|defends/i);
  });

  it('renders the guardian promise on signup without a fallback', () => {
    const source = readFileSync(join(root, 'src/app/[locale]/auth/signup/page.tsx'), 'utf8');

    expect(source).toContain("t('auth.signup.guardianPromise')");
    expect(source).not.toContain("auth.signup.guardianPromise', { defaultValue");
  });
});
