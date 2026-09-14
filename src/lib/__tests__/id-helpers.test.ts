/**
 * id-helpers 纯函数测试 (testgap v5 低危补盲 batch72-c)
 *
 * 规则：
 * - generateDreamFundId 是 dream fund ID 的唯一生成入口（ARCH fix Round 5 AUDIT-1 L-2）
 * - 主路径：crypto.randomUUID 可用 → `df-<uuid v4 格式>`
 * - fallback：crypto/randomUUID 缺失 → `df-<13 位时间戳>-<8 位 base36>`（旧环境兜底）
 * - 两分支都必须 df- 前缀开头，且多次调用不重复
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateDreamFundId } from '@/lib/id-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateDreamFundId', () => {
  it('主路径：crypto.randomUUID 可用时返回 df-<uuid>，多次调用唯一', () => {
    const id = generateDreamFundId();
    expect(id).toMatch(/^df-/);
    expect(id.slice('df-'.length)).toMatch(UUID_RE);

    const ids = new Set(Array.from({ length: 50 }, () => generateDreamFundId()));
    expect(ids.size).toBe(50);
  });

  it('fallback：crypto.randomUUID 缺失（stub 成空对象）走时间戳+random 分支', () => {
    vi.stubGlobal('crypto', {});
    const id = generateDreamFundId();
    expect(id).toMatch(/^df-\d{13}-[0-9a-z]{8}$/);

    const ids = new Set(Array.from({ length: 20 }, () => generateDreamFundId()));
    expect(ids.size).toBe(20);
  });

  it('fallback：crypto.randomUUID 存在但不是函数，同样走 fallback', () => {
    vi.stubGlobal('crypto', { randomUUID: 'not-a-function' });
    expect(generateDreamFundId()).toMatch(/^df-\d{13}-[0-9a-z]{8}$/);
  });
});
