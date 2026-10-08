import { describe, expect, it } from 'vitest';

import { initialContext } from '../butterfly-machine-types';

/**
 * butterfly-machine-types.ts (237行) — machine 类型定义件 (纯声明 + initialContext + 事件联合)。
 *
 * 运行时仅 initialContext 一个值。测试锁:
 * 1. 初始 context 全字段安全默认 (无残留会话引用)
 * 2. 后续 machine 测试依赖的字段名不漂移
 */

describe('butterfly-machine-types 初始上下文 (237行)', () => {
  it('initialContext 安全默认: idle 态零残留', () => {
    expect(initialContext).toBeTruthy();
    expect(initialContext.isLoading).toBe(false);
    expect(initialContext.error).toBeNull();
    expect(initialContext.errorDetail).toBeNull();
    expect(initialContext.session).toBeNull();
    expect(initialContext.isDemo).toBe(false);
    expect(initialContext.locale).toBe('en');
    expect(initialContext.userId).toBeNull();
    // Round 17 XState-H2: polling 防重复 spawn 标志初始关
    expect(initialContext.isPollingActive).toBe(false);
    expect(initialContext.isPreloading).toBe(false);
  });

  it('集合字段全空态 (尝试标志/章节/预载缓存零残留)', () => {
    const c = initialContext as unknown as Record<string, unknown>;
    const emptyKeys = Object.keys(c).filter((k) => Array.isArray(c[k]) || (c[k] && typeof c[k] === 'object'));
    for (const key of emptyKeys) {
      const v = c[key];
      if (key === 'endpoints') continue; // 五端点默认配置 (合法非空)
      expect(Array.isArray(v) ? v.length : Object.keys(v as object).length, `${key} 应为空态`).toBe(0);
    }
  });

  it('initialContext 可序列化 (进 XState context 门槛)', () => {
    expect(() => JSON.parse(JSON.stringify(initialContext))).not.toThrow();
  });

  it('endpoints 默认五端点 (preloadBranch 进 context 非 actor 硬编码)', () => {
    expect(initialContext.endpoints).toEqual({
      session: '/api/butterfly/session',
      story: '/api/butterfly/story',
      choice: '/api/butterfly/choice',
      illustration: '/api/butterfly/illustration',
      preloadBranch: '/api/butterfly/preload-branch',
    });
  });
});
