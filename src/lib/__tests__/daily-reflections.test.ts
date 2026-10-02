// daily-reflections — 每日守护文案轮换（此前 0 测试）
// 红线: 14条双语固定序; UTC day-of-year 轮换; 仪式与主页不重复(+1)。
import { describe, expect, it } from 'vitest';
import {
  DAILY_GUARDIAN_LINES,
  getDailyGuardianIndex,
  getRitualGuardianLine,
  getTodayGuardianLine,
} from '@/lib/daily-reflections';

describe('daily-reflections — 守护文案库', () => {
  it('恰好 14 条且双语非空', () => {
    expect(DAILY_GUARDIAN_LINES).toHaveLength(14);
    for (const line of DAILY_GUARDIAN_LINES) {
      expect(line.zh.length).toBeGreaterThan(6);
      expect(line.en.length).toBeGreaterThan(6);
    }
  });

  it('语气红线: 零说教/零羞辱/零碳数值', () => {
    const banned = /应该|不该|浪费|可耻|后悔|失败|你欠|教你|劝你|kg|吨碳|碳足迹\d/;
    for (const line of DAILY_GUARDIAN_LINES) {
      expect(line.zh).not.toMatch(banned);
    }
  });
});

describe('getDailyGuardianIndex — UTC 轮换', () => {
  it('年初 (1月1日) → 小 index', () => {
    const idx = getDailyGuardianIndex(new Date(Date.UTC(2026, 0, 1)));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(14);
  });

  it('同一天不同时区表达 → 同一 index (UTC 口径)', () => {
    const utcNoon = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
    const utcNight = new Date(Date.UTC(2026, 9, 2, 23, 59, 59));
    expect(getDailyGuardianIndex(utcNoon)).toBe(getDailyGuardianIndex(utcNight));
  });

  it('相邻两天 → 相邻 index (环绕)', () => {
    const d1 = new Date(Date.UTC(2026, 9, 2));
    const d2 = new Date(Date.UTC(2026, 9, 3));
    const i1 = getDailyGuardianIndex(d1);
    const i2 = getDailyGuardianIndex(d2);
    expect((i1 + 1) % 14).toBe(i2);
  });
});

describe('getRitualGuardianLine / getTodayGuardianLine — 仪式与主页不重复', () => {
  it('同一天: 主页文案 = 仪式文案的下一条 (+1 环绕)', () => {
    const date = new Date(Date.UTC(2026, 9, 2));
    const ritual = getRitualGuardianLine(date);
    const today = getTodayGuardianLine(date);
    expect(today).not.toBe(ritual);
    const rIdx = DAILY_GUARDIAN_LINES.indexOf(ritual);
    expect(DAILY_GUARDIAN_LINES[(rIdx + 1) % 14]).toBe(today);
  });

  it('年末数学事实: 365%14=1 — 跨年当天与次年首日文案恰好相同(轮换按天递增的自然结果, 非bug)', () => {
    const nye = new Date(Date.UTC(2026, 11, 31)); // dayOfYear=365, idx=1
    const nyd = new Date(Date.UTC(2027, 0, 1));   // dayOfYear=1,   idx=1
    expect(getRitualGuardianLine(nye)).toBe(getRitualGuardianLine(nyd));
    // 而 12月30日 → 次年1月1日 确实递增
    const dec30 = new Date(Date.UTC(2026, 11, 30)); // idx=0
    expect(getRitualGuardianLine(dec30)).not.toBe(getRitualGuardianLine(nyd));
  });
});
