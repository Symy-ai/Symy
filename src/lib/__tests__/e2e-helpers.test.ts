import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// e2e/helpers.ts 在模块顶层读取 process.env 凭据 — 用 resetModules + 动态 import
// 观察不同 env 状态下的求值结果 (纯导入级回归锁, 不起浏览器)。
describe('e2e/helpers credentials', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to empty strings and does not throw when E2E env vars are absent', async () => {
    vi.stubEnv('E2E_EMAIL', undefined);
    vi.stubEnv('E2E_PASSWORD', undefined);

    const helpers = await import('../../../e2e/helpers');

    expect(helpers.TEST_EMAIL).toBe('');
    expect(helpers.TEST_PASSWORD).toBe('');
  });

  it('reads credentials from the environment when provided', async () => {
    vi.stubEnv('E2E_EMAIL', 'runner@example.com');
    vi.stubEnv('E2E_PASSWORD', 'test-secret');

    const helpers = await import('../../../e2e/helpers');

    expect(helpers.TEST_EMAIL).toBe('runner@example.com');
    expect(helpers.TEST_PASSWORD).toBe('test-secret');
  });
});
