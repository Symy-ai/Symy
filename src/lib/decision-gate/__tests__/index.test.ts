import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  PRECHECK_DEFAULT_TIMEOUT_MS,
  PRECHECK_REGISTRY,
  PRECHECK_REGISTRY_SIZE,
  WAVE1_OUT_OF_REGISTRY,
  findPrecheckSpec,
  getProductionGate,
  isDecisionGateEnabled,
} from '../index';

/**
 * decision-gate/index.ts (64行) — Jev 语义层统一出口 (Phase 0 只建不接)。
 *
 * 锁定:
 * - 总开关: DECISION_GATE_ENABLED==='1' 才开 (默认关 — 只建不接纪律)
 * - 开关关 → getProductionGate()=null 零开销 (不建 gate 对象)
 * - 开关开 → 惰性单例 (二次调用同引用)
 * - registry 四导出可达
 */
describe('DecisionGate 总开关', () => {
  const orig = process.env.DECISION_GATE_ENABLED;
  afterEach(() => {
    if (orig === undefined) delete process.env.DECISION_GATE_ENABLED;
    else process.env.DECISION_GATE_ENABLED = orig;
  });

  it('默认关 (未设/非 1 值 → false)', () => {
    delete process.env.DECISION_GATE_ENABLED;
    expect(isDecisionGateEnabled()).toBe(false);
    process.env.DECISION_GATE_ENABLED = 'true';
    expect(isDecisionGateEnabled()).toBe(false); // 严格 ==='1', 'true' 不算
  });

  it('开关关 → getProductionGate()=null 零开销', () => {
    delete process.env.DECISION_GATE_ENABLED;
    expect(getProductionGate()).toBeNull();
  });
});

describe('registry 导出面', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('四导出可达', () => {
    expect(typeof PRECHECK_DEFAULT_TIMEOUT_MS).toBe('number');
    expect(PRECHECK_REGISTRY).toBeTruthy();
    expect(typeof PRECHECK_REGISTRY_SIZE).toBe('number');
    expect(WAVE1_OUT_OF_REGISTRY).toBeTruthy();
    expect(typeof findPrecheckSpec).toBe('function');
  });

  it('findPrecheckSpec 未命中 → undefined 语义 (不炸)', () => {
    expect(findPrecheckSpec('definitely-not-a-real-id-xyz')).toBeUndefined();
  });
});
