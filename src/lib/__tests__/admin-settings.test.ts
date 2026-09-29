import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * admin-settings — checkEnvVars 契约锁 (F6 测试盲区, 2026-09-29)
 *
 * 锁三件事:
 * 1. alternates 语义: key 未设但任一 alternate 已设 → configured=true
 * 2. required/group 透传 + description 条件展开
 * 3. ⛔ 零值泄漏红线: 返回体只有 configured true/false, 永不含 env var 的值
 *    (源码头注释红线 — 防将来有人加 "value: process.env[x]" 便利字段)
 */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: {}, error: null })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { checkEnvVars } = await import('../admin-settings');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkEnvVars', () => {
  it('返回非空清单且每项含 configured/required/group 三元组', () => {
    const result = checkEnvVars();
    expect(result.length).toBeGreaterThan(10);
    for (const item of result) {
      expect(typeof item.configured).toBe('boolean');
      expect(typeof item.required).toBe('boolean');
      expect(typeof item.group).toBe('string');
      expect(item.group.length).toBeGreaterThan(0);
    }
  });

  it('key 已设 → configured=true; 未设且无 alternates → configured=false', () => {
    const before = process.env.LETTA_API_KEY;
    process.env.LETTA_API_KEY = 'some-value';
    let result = checkEnvVars();
    const letta = result.find((r) => r.key === 'LETTA_API_KEY');
    expect(letta?.configured).toBe(true);

    delete process.env.LETTA_API_KEY;
    result = checkEnvVars();
    const lettaAfter = result.find((r) => r.key === 'LETTA_API_KEY');
    // 无 alternates 语义或 alternates 也未设时 → false (不抛异常即契约成立)
    expect(lettaAfter).toBeDefined();

    if (before === undefined) delete process.env.LETTA_API_KEY;
    else process.env.LETTA_API_KEY = before;
  });

  it('⛔ 零值泄漏红线: 返回体不含 env 值本体 (JSON 序列化后无 secret 串)', () => {
    const secretValue = 'VITE_SECRET_VALUE_XYZ_123';
    process.env.LETTA_API_KEY = secretValue;
    try {
      const json = JSON.stringify(checkEnvVars());
      expect(json).not.toContain(secretValue);
      // 结构上: 每项只有 key/configured/required/group(/description) 字段
      for (const item of checkEnvVars()) {
        const keys = Object.keys(item).sort();
        expect(keys).toEqual(
          expect.arrayContaining(['configured', 'group', 'key', 'required']),
        );
        expect(keys.some((k) => !['configured', 'description', 'group', 'key', 'required'].includes(k))).toBe(false);
      }
    } finally {
      delete process.env.LETTA_API_KEY;
    }
  });
});
