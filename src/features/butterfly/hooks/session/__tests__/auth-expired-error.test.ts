import { describe, expect, it } from 'vitest';

import { AuthExpiredError } from '../auth-expired-error';

/**
 * auth-expired-error.ts (15行) — 401 特化错误 (Round 60 循环依赖拆件)。
 *
 * 锁定:
 * - instanceof Error + AuthExpiredError 双身份
 * - statusCode=401 只读
 * - 默认消息+自定义消息
 */
describe('AuthExpiredError', () => {
  it('双身份: Error + AuthExpiredError', () => {
    const err = new AuthExpiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthExpiredError);
    expect(err.name).toBe('AuthExpiredError');
  });

  it('statusCode=401 锚 (readonly 是编译期保证 — 运行时值锁定)', () => {
    const err = new AuthExpiredError();
    expect(err.statusCode).toBe(401);
    // TS readonly 拦截在编译期; 运行时锁值不变量 (新实例恒 401)
    expect(new AuthExpiredError().statusCode).toBe(401);
  });

  it('默认消息+自定义', () => {
    expect(new AuthExpiredError().message).toBe('Authentication expired');
    expect(new AuthExpiredError('会话已过期').message).toBe('会话已过期');
  });
});
