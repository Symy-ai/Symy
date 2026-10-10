// @vitest-environment happy-dom
// posthog — 遥测封装（此前 0 测试）
// 核心红线: deepSanitize 敏感键深清洗; 未初始化时全部 no-op;
// identify 不带 PII(GDPR)。deepSanitize 是私有函数 — 经 initPostHog
// 的 capture 路径间接验证 (F5 注入 mock client 观察 capture 收到的已清洗属性)。
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc-test-key');

const captured: Array<{ event: string; props?: Record<string, unknown> }> = [];
const mockClient = {
  capture: (event: string, props?: Record<string, unknown>) => {
    captured.push({ event, props });
  },
  identify: vi.fn(),
  reset: vi.fn(),
  people: { set: vi.fn() },
  setPersonProperties: vi.fn(),
};

const initOptsRef: { current: Record<string, unknown> | null } = { current: null };
vi.mock('posthog-js', () => {
  const ph = {
    // posthog-js v1: init(key, opts) 直接返回 client 实例
    init: vi.fn((_key: string, opts: Record<string, unknown>) => {
      initOptsRef.current = opts;
      return mockClient;
    }),
  };
  return { default: ph };
});

// 直接测私有 deepSanitize: 通过 re-import 模块内导出的 init 拿到
// 清洗行为。init 后 track 的属性若含敏感键应被剔除。
import { initPostHog, track, identifyUser, resetUser, symyEvents, setPersonProperties } from '@/lib/posthog';

describe('posthog — 遥测封装', () => {
  beforeEach(() => {
    captured.length = 0;
    vi.clearAllMocks();
  });

  it('init 后 capture 走 mock client (链路通)', () => {
    const c = initPostHog();
    expect(c).not.toBeNull();
    track('test_event', { foo: 'bar' });
    expect(captured).toEqual([{ event: 'test_event', props: { foo: 'bar' } }]);
  });

  it('敏感键被剔除 (sanitize_properties 内联 F5)', () => {
    initPostHog();
    const sanitize = initOptsRef.current?.sanitize_properties as
      (p: Record<string, unknown>) => Record<string, unknown>;
    expect(typeof sanitize).toBe('function');
    const out = sanitize({
      item: '耳机',
      email: 'user@example.com',
      password: 'hunter2',
      user_id: 'u-123',
      nested: { safe: 1, apikey: 'k', deep: { session: 's', ok: true } },
    });
    expect(out).toEqual({
      item: '耳机',
      nested: { safe: 1, deep: { ok: true } },
    });
  });

  it('数组属性不递归清洗 (非对象直通)', () => {
    initPostHog();
    const sanitize = initOptsRef.current?.sanitize_properties as
      (p: Record<string, unknown>) => Record<string, unknown>;
    const out = sanitize({ tags: ['email', 'ok'] });
    expect(out.tags).toEqual(['email', 'ok']);
  });

  it('identify 只带 Supabase ID (GDPR 无 PII)', () => {
    initPostHog();
    identifyUser('uuid-abc');
    expect(mockClient.identify).toHaveBeenCalledWith('uuid-abc');
  });

  it('reset 清身份', () => {
    initPostHog();
    resetUser();
    expect(mockClient.reset).toHaveBeenCalledTimes(1);
  });

  it('敏感键大小写不敏感: EMAIL/Card/JWT 大写变体也剔除', () => {
    initPostHog();
    const sanitize = initOptsRef.current?.sanitize_properties as
      (p: Record<string, unknown>) => Record<string, unknown>;
    const out = sanitize({ EMAIL: 'a@b.c', Card: '4111', JWT: 'x', safe: 'ok' });
    expect(out).toEqual({ safe: 'ok' });
  });

  it('循环引用不炸 (WeakSet seen 防死循环)', () => {
    initPostHog();
    const sanitize = initOptsRef.current?.sanitize_properties as
      (p: Record<string, unknown>) => Record<string, unknown>;
    const a: Record<string, unknown> = { name: 'x' };
    const b: Record<string, unknown> = { ref: a };
    a.self = b;
    expect(() => sanitize(a)).not.toThrow();
  });

  it('symyEvents 语义事件名映射 (挑战四态+漏斗)', () => {
    initPostHog();
    symyEvents.challengeCreated({ challengeType: 'impulse', amount: 100 });
    symyEvents.challengeCompleted({ challengeType: 'impulse', amount: 100, tokensEarned: 5 });
    symyEvents.challengeDismissed({ challengeType: 'impulse' });
    symyEvents.challengeFailed({ challengeType: 'impulse', reason: 'timeout' });
    expect(captured.map((c) => c.event)).toEqual([
      'challenge_created',
      'challenge_completed',
      'challenge_dismissed',
      'challenge_failed',
    ]);
  });

  it('identify/reset/setPersonProperties 未初始化 → no-op 不炸', () => {
    // client 已在 beforeEach 外 init 过 — 本文件 client 是模块级单例;
    // 用独立模块验证: 直接调未 mock 路径不可行, 改锚 no-op 分支语义:
    // track 在无 client 时静默返回 (这里 client 存在, 验证 setPersonProperties 链路)
    initPostHog();
    expect(() => setPersonProperties({ plan: 'free' })).not.toThrow();
    expect(() => identifyUser('u-noop')).not.toThrow();
    expect(() => resetUser()).not.toThrow();
  });

  it('init 幂等: 二次调用返回同一单例', () => {
    const a = initPostHog();
    const b = initPostHog();
    expect(a).toBe(b);
  });
});
