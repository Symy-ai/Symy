import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/features/butterfly/lib/demo-content', () => ({
  generateDemoOutline: vi.fn(() => ({ version: 1, chapters: [], endingHint: 'demo' })),
}));

import {
  createDemoSession,
  deleteDemoSession,
  getDemoSession,
  updateDemoSession,
} from '../demo-session-store';

/**
 * demo-session-store.ts (130行) — 内存 demo 会话存取 (TTL+LRU 双清理)。
 *
 * 锁定:
 * - create: UUID id + demo-user + 全字段默认
 * - get: 存在返回 / 不存在 null
 * - update: spread 合并 + updatedAt 刷新; 不存在 null
 * - delete: 双 Map 清理 + 布尔回
 * - TTL: 2h 过期惰性清理 (get 时触发)
 * - LRU: >200 最旧淘汰 (fake timers 控制 timestamp)
 */
describe('demo-session-store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('create → 全字段 (UUID/demo-user/active/时间戳)', () => {
    const s = createDemoSession({ decisionType: 'bought', decisionDescription: '键盘', locale: 'zh' });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.userId).toBe('demo-user');
    expect(s.status).toBe('active');
    expect(s.chapters).toEqual([]);
    expect(s.createdAt).toBe(s.updatedAt);
  });

  it('get 往返 + 未知 id → null', () => {
    const s = createDemoSession({ decisionType: 'resisted', decisionDescription: 'x', locale: 'en' });
    expect(getDemoSession(s.id)?.id).toBe(s.id);
    expect(getDemoSession('nonexistent')).toBeNull();
  });

  it('update: 合并 + updatedAt 刷新; 未知 → null', () => {
    const s = createDemoSession({ decisionType: 'bought', decisionDescription: 'd', locale: 'zh' });
    vi.setSystemTime(new Date('2026-10-09T12:01:00Z'));
    const u = updateDemoSession(s.id, { currentChapter: 2, status: 'completed' });
    expect(u?.currentChapter).toBe(2);
    expect(u?.status).toBe('completed');
    expect(u!.updatedAt > u!.createdAt).toBe(true);
    expect(updateDemoSession('ghost', { status: 'abandoned' })).toBeNull();
  });

  it('delete: 双清 + 布尔回', () => {
    const s = createDemoSession({ decisionType: 'bought', decisionDescription: 'd', locale: 'zh' });
    expect(deleteDemoSession(s.id)).toBe(true);
    expect(getDemoSession(s.id)).toBeNull();
    expect(deleteDemoSession(s.id)).toBe(false);
  });

  it('TTL: 2h 后 get 惰性清理', () => {
    const s = createDemoSession({ decisionType: 'bought', decisionDescription: 'd', locale: 'zh' });
    vi.setSystemTime(new Date('2026-10-09T14:00:01Z')); // +2h1s
    expect(getDemoSession(s.id)).toBeNull();
  });

  it('TTL 内不清理 (1h59m 仍在)', () => {
    const s = createDemoSession({ decisionType: 'bought', decisionDescription: 'd', locale: 'zh' });
    vi.setSystemTime(new Date('2026-10-09T13:59:00Z'));
    expect(getDemoSession(s.id)?.id).toBe(s.id);
  });

  it('LRU: 201 个 session 时最旧被淘汰 (ARCH-3 #11)', () => {
    const first = createDemoSession({ decisionType: 'bought', decisionDescription: 'oldest', locale: 'zh' });
    for (let i = 0; i < 200; i++) {
      vi.setSystemTime(new Date(Date.now() + 1000)); // 每个+1s 保证顺序
      createDemoSession({ decisionType: 'resisted', decisionDescription: `s${i}`, locale: 'zh' });
    }
    // 201 个 → 超 MAX 200 → 最旧 (first) 被逐
    expect(getDemoSession(first.id)).toBeNull();
  });
});
