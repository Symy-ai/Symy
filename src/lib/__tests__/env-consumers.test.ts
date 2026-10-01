import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENV_CONSUMERS,
  getEnvConsumerStatus,
  resetEnvWarningStateForTests,
  warnMissingEnvOnce,
  warnPartialEnvOnce,
} from '@/lib/env-consumers';

const controlledEnvKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_DSN',
  'LETTA_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;
const savedEnv = new Map(controlledEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvWarningStateForTests();
  vi.restoreAllMocks();
});

describe('env consumer registry', () => {
  it('records behavior and product impact for every consumed feature group', () => {
    expect(ENV_CONSUMERS.length).toBeGreaterThan(15);
    for (const consumer of ENV_CONSUMERS) {
      expect(consumer.feature).toBeTruthy();
      expect(consumer.requirements.length).toBeGreaterThan(0);
      expect(['default', 'disabled', 'explicit-failure']).toContain(consumer.behavior);
      expect(consumer.impact).toBeTruthy();
    }
  });

  it('reports configured with either accepted key alternative', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';

    expect(getEnvConsumerStatus('Supabase authenticated client')).toMatchObject({ configured: true, behavior: 'disabled' });
  });

  it('reports unconfigured when a required alternative group is empty', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = undefined;

    expect(getEnvConsumerStatus('Supabase authenticated client')).toMatchObject({ configured: false, behavior: 'disabled' });
  });

  it('warns once per feature and preserves explicit failure behavior', () => {
    delete process.env.LETTA_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(warnMissingEnvOnce('Letta conversation and agent management')).toBe(true);
    expect(warnMissingEnvOnce('Letta conversation and agent management')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('LETTA_API_KEY');
    expect(getEnvConsumerStatus('Letta conversation and agent management')).toMatchObject({
      configured: false,
      behavior: 'explicit-failure',
    });
  });

  it('accepts either Sentry DSN key and does not warn when configured', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://sentry.test/1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getEnvConsumerStatus('Sentry error monitoring')).toMatchObject({ configured: true, behavior: 'disabled' });
    expect(warnMissingEnvOnce('Sentry error monitoring')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for partially configured Supabase admin credentials', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    process.env.SUPABASE_SECRET_KEY = undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(warnPartialEnvOnce('Supabase admin client')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY');
  });
});
