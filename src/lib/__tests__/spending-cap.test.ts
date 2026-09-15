/**
 * batch76-b — lib/spending-cap.ts 现状固化（testgap v8 Top20 #10 首批断言点）
 *
 * 该文件是 spending-cap route / tracker / chat-context 三方消费的 SSOT：
 *   - normalizeSpendingCapSetting：写入路径的唯一钳制层（route PUT 用）
 *   - parseSpendingCapSettingValue：读取路径（route GET 经 normalize 再包一层；
 *     chat/spending-cap-context 直接消费 parse 原始输出）
 *   - spendingCapPeriodEnd：周期口径（tracker 与 route 查询窗口共用）
 *
 * v8 #10 断言点逐条落点：
 *   ① capCents=Infinity 穿透 normalize 钳制 → 本测试固化现状（缺陷记录见 /tmp/b76b-defects.md）；
 *   ② parse 路径对负 capCents 不钳制（与 normalize 不对称）→ 固化现状；
 *   ③ spendingCapPeriodEnd 大小月/闰年边界（报告预期"次月末"系口径误读，
 *      实际语义 = periodStart 所在自然月的月末 23:59:59.999，按实际断言）；
 *   ④ 序列化长度受 shopping_facts.value 200 字符约束 → 断言上限内。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeSpendingCapSetting,
  startOfMonth,
  spendingCapPeriodEnd,
  serializeSpendingCapSetting,
  parseSpendingCapSettingValue,
  SPENDING_CAP_FACT_CATEGORY,
  SPENDING_CAP_FACT_KEY,
} from '@/lib/spending-cap';

const NOW = new Date(2026, 8, 15, 12, 0, 0); // 2026-09-15 12:00 本地时区

describe('normalizeSpendingCapSetting', () => {
  it('null/undefined input → disabled default (capCents 0, warningPct 80, startOfMonth)', () => {
    for (const input of [null, undefined]) {
      const setting = normalizeSpendingCapSetting(input, NOW);
      expect(setting.capCents).toBe(0);
      expect(setting.warningPct).toBe(80);
      expect(new Date(setting.periodStart)).toEqual(new Date(2026, 8, 1));
    }
  });

  it('capCents clamps: negative → 0, floor decimals, NaN/missing → 0', () => {
    expect(normalizeSpendingCapSetting({ capCents: -5 }, NOW).capCents).toBe(0);
    expect(normalizeSpendingCapSetting({ capCents: 1.5 }, NOW).capCents).toBe(1);
    expect(normalizeSpendingCapSetting({ capCents: NaN }, NOW).capCents).toBe(0);
    expect(normalizeSpendingCapSetting({}, NOW).capCents).toBe(0);
    expect(normalizeSpendingCapSetting({ capCents: 5000 }, NOW).capCents).toBe(5000);
  });

  it('warningPct clamps to [50, 95] with floor, NaN/missing → 80', () => {
    expect(normalizeSpendingCapSetting({ warningPct: 49 }, NOW).warningPct).toBe(50);
    expect(normalizeSpendingCapSetting({ warningPct: 49.9 }, NOW).warningPct).toBe(50); // floor(49.9)=49 → lift to 50
    expect(normalizeSpendingCapSetting({ warningPct: 96 }, NOW).warningPct).toBe(95);
    expect(normalizeSpendingCapSetting({ warningPct: 95.9 }, NOW).warningPct).toBe(95);
    expect(normalizeSpendingCapSetting({ warningPct: NaN }, NOW).warningPct).toBe(80);
    expect(normalizeSpendingCapSetting({ capCents: 100 }, NOW).warningPct).toBe(80);
  });

  it('v8 #10① 现状固化: capCents=Infinity 穿透钳制 (Math.floor(Infinity)=Infinity)', () => {
    const setting = normalizeSpendingCapSetting({ capCents: Infinity }, NOW);
    expect(setting.capCents).toBe(Infinity); // 未归一为上限或 0 — 已记 /tmp/b76b-defects.md
  });

  it('v8 #10① 后半段: Infinity 序列化后静默变 null, 再 parse 回 0 (上限静默失联)', () => {
    const serialized = serializeSpendingCapSetting(normalizeSpendingCapSetting({ capCents: Infinity }, NOW));
    expect(serialized).toContain('"capCents":null');
    expect(parseSpendingCapSettingValue(serialized)?.capCents).toBe(0);
  });

  it('input periodStart is ignored — period is always startOfMonth(now)', () => {
    const setting = normalizeSpendingCapSetting(
      { capCents: 100, periodStart: '2020-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(new Date(setting.periodStart)).toEqual(new Date(2026, 8, 1));
  });
});

describe('startOfMonth', () => {
  it('returns local first-of-month at midnight, dropping time-of-day', () => {
    expect(startOfMonth(new Date(2026, 8, 15, 13, 45, 30))).toEqual(new Date(2026, 8, 1));
    expect(startOfMonth(new Date(2026, 0, 31, 23, 59))).toEqual(new Date(2026, 0, 1));
  });
});

describe('spendingCapPeriodEnd', () => {
  it('period of January ends Jan 31 23:59:59.999 (当月月末, 非次月末 — v8 报告口径修正)', () => {
    expect(spendingCapPeriodEnd(new Date(2026, 0, 15).toISOString(), NOW))
      .toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
  });

  it('leap-year February ends on the 29th, non-leap on the 28th', () => {
    expect(spendingCapPeriodEnd(new Date(2024, 1, 10).toISOString(), NOW))
      .toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));
    expect(spendingCapPeriodEnd(new Date(2026, 1, 10).toISOString(), NOW))
      .toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
  });

  it('30-day months end on the 30th (April)', () => {
    expect(spendingCapPeriodEnd(new Date(2026, 3, 9).toISOString(), NOW))
      .toEqual(new Date(2026, 3, 30, 23, 59, 59, 999));
  });

  it('invalid periodStart falls back to startOfMonth(now)', () => {
    expect(spendingCapPeriodEnd('not-a-date', NOW)).toEqual(new Date(2026, 8, 1));
  });
});

describe('serializeSpendingCapSetting / parseSpendingCapSettingValue', () => {
  it('round trip preserves a valid setting', () => {
    const setting = { capCents: 500000, periodStart: '2026-09-01T00:00:00.000Z', warningPct: 90 };
    expect(parseSpendingCapSettingValue(serializeSpendingCapSetting(setting))).toEqual(setting);
  });

  it('v8 #10④: serialized value stays within shopping_facts 200-char limit at max zod cap', () => {
    const serialized = serializeSpendingCapSetting({
      capCents: 100_000_000,
      periodStart: '2026-09-01T00:00:00.000Z',
      warningPct: 95,
    });
    expect(serialized.length).toBeLessThanOrEqual(200);
  });

  it('null/empty/malformed JSON → null (safe fallback, no throw)', () => {
    expect(parseSpendingCapSettingValue(null)).toBeNull();
    expect(parseSpendingCapSettingValue(undefined)).toBeNull();
    expect(parseSpendingCapSettingValue('')).toBeNull();
    expect(parseSpendingCapSettingValue('not json {')).toBeNull();
  });

  it('v8 #10② 现状固化: parse does NOT clamp negative capCents (与 normalize 不对称)', () => {
    expect(parseSpendingCapSettingValue('{"capCents":-5}')).toEqual({ capCents: -5, warningPct: 80 });
  });

  it('parse coerces: numeric string → number, null capCents → 0, missing → 0', () => {
    expect(parseSpendingCapSettingValue('{"capCents":"50"}')?.capCents).toBe(50);
    expect(parseSpendingCapSettingValue('{"capCents":null}')?.capCents).toBe(0);
    expect(parseSpendingCapSettingValue('{}')?.capCents).toBe(0);
  });

  it('parse does NOT clamp warningPct: 0 swallows to 80, out-of-range 200 passes through raw', () => {
    expect(parseSpendingCapSettingValue('{"warningPct":0}')?.warningPct).toBe(80);
    expect(parseSpendingCapSettingValue('{"warningPct":200}')?.warningPct).toBe(200); // normalize 会钳到 95 — 不对称
  });

  it('non-string periodStart → undefined; string passes through unvalidated', () => {
    expect(parseSpendingCapSettingValue('{"periodStart":123}')).toEqual({ capCents: 0, warningPct: 80 });
    expect(parseSpendingCapSettingValue('{"periodStart":"garbage"}')?.periodStart).toBe('garbage');
  });

  it('non-object JSON (array/number/string) → default-shaped partial, no throw', () => {
    expect(parseSpendingCapSettingValue('[1,2]')).toEqual({ capCents: 0, warningPct: 80 });
    expect(parseSpendingCapSettingValue('123')).toEqual({ capCents: 0, warningPct: 80 });
  });
});

describe('storage contract constants (batch67 零 DDL: 设置存 shopping_facts)', () => {
  it('category/key pin the zero-DDL shopping_facts row identity', () => {
    expect(SPENDING_CAP_FACT_CATEGORY).toBe('budget');
    expect(SPENDING_CAP_FACT_KEY).toBe('spending_cap');
  });
});
