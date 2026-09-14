/**
 * RpcHealth — unit tests
 *
 * 🔧 架构优化 Round 48: 测试 RPC 可用性追踪逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RpcHealth } from '../rpc-health';

describe('RpcHealth', () => {
  let health: RpcHealth;

  beforeEach(() => {
    health = new RpcHealth(1000); // 1 second retry for fast tests
  });

  it('shouldTry returns true on first call (never tried)', () => {
    expect(health.shouldTry()).toBe(true);
  });

  it('shouldTry returns true after markAvailable', () => {
    health.markAvailable();
    expect(health.shouldTry()).toBe(true);
  });

  it('shouldTry returns false immediately after markFailed', () => {
    health.markFailed();
    expect(health.shouldTry()).toBe(false);
  });

  it('shouldTry returns true after retry interval elapses', () => {
    health.markFailed();
    expect(health.shouldTry()).toBe(false);

    // Advance time past retry interval
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(health.shouldTry()).toBe(true);
    vi.useRealTimers();
  });

  it('reset returns to unknown state', () => {
    health.markFailed();
    expect(health.state).toBe(false);

    health.reset();
    expect(health.state).toBe(null);
    expect(health.shouldTry()).toBe(true);
  });

  it('markAvailable clears lastFailTime', () => {
    health.markFailed();
    health.markAvailable();
    // Should not need retry
    expect(health.shouldTry()).toBe(true);
  });

  it('multiple instances are independent', () => {
    const health1 = new RpcHealth(10000);
    const health2 = new RpcHealth(10000);

    health1.markFailed();
    expect(health1.shouldTry()).toBe(false);
    expect(health2.shouldTry()).toBe(true); // independent
  });
});
