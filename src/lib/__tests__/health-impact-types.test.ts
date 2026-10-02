// health-impact-types — 健康事件计算核心（此前 0 测试; 计算函数在 buddy-defaults 已有覆盖,
// 本文件锁 HealthDelta 编排层: 事件类型→活力/代币变化+诚实减伤30%+未知事件零变化）
import { describe, expect, it } from 'vitest';
import {
  calculateHealthDelta,
  VALID_EVENT_TYPES,
  VALID_TRIGGER_SOURCES,
  type HealthEventInput,
  type BuddyStateRow,
} from '@/lib/health-impact-types';

function delta(eventType: string, metadata: Record<string, unknown> = {}, buddy: Partial<BuddyStateRow> = {}) {
  return calculateHealthDelta(
    { eventType, metadata, triggerSource: 'email_receipt', triggerId: null } as unknown as HealthEventInput,
    buddy,
  );
}

describe('calculateHealthDelta — 事件编排层', () => {
  it('impulse_damage: 负活力-1代币', () => {
    const d = delta('impulse_damage', { impulseScore: 60, amount: 100 });
    expect(d.vitalityChange).toBeLessThan(0);
    expect(d.tokenChange).toBe(-1);
  });

  it('impulse_confessed: 诚实减伤 30% (damage×0.7)', () => {
    const dmg = delta('impulse_damage', { impulseScore: 60, amount: 100 });
    const confessed = delta('impulse_confessed', { impulseScore: 60, amount: 100 });
    expect(confessed.vitalityChange).toBe(Math.round(dmg.vitalityChange * 0.7));
    expect(confessed.tokenChange).toBe(-1);
  });

  it('mindful_recovery: 正活力+2代币', () => {
    const d = delta('mindful_recovery', { impulseScore: 50 });
    expect(d.vitalityChange).toBeGreaterThan(0);
    expect(d.tokenChange).toBe(2);
  });

  it('refund_boost: 正活力+3代币', () => {
    const d = delta('refund_boost', { amount: 80 });
    expect(d.vitalityChange).toBeGreaterThan(0);
    expect(d.tokenChange).toBe(3);
  });

  it('metadata 缺失 → 默认值 (60分/0额) 不炸', () => {
    const d = delta('impulse_damage');
    expect(Number.isFinite(d.vitalityChange)).toBe(true);
  });

  it('未知事件类型 → 零变化', () => {
    const d = delta('nonexistent_event_type');
    expect(d.vitalityChange).toBe(0);
    expect(d.tokenChange).toBe(0);
  });

  it('buddyState null 也安全', () => {
    expect(() => delta('impulse_damage', { impulseScore: 60 }, null as unknown as Partial<BuddyStateRow>)).not.toThrow();
  });
});

describe('枚举白名单', () => {
  it('VALID_EVENT_TYPES 覆盖关键事件 (含 butterfly)', () => {
    for (const t of ['impulse_damage', 'mindful_recovery', 'challenge_completed', 'butterfly_completed']) {
      expect(VALID_EVENT_TYPES).toContain(t);
    }
  });

  it('VALID_TRIGGER_SOURCES 含 deposit_api (P2-11)', () => {
    expect(VALID_TRIGGER_SOURCES).toContain('deposit_api');
  });
});
