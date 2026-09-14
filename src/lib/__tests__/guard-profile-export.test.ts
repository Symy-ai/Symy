/**
 * guard-profile-export 测试 (batch58-b)
 *
 * 覆盖: 全量导出 (配置摘要 + 成果 + 金额) / 样本不足降级 (只导出配置) /
 * corrupt localStorage 输入逐项 normalize 降级 / 分享版 amount-free 红线
 * (无货币符号/无金额模式, 次数/小时/天数允许) / zh+en 双语。
 */
import { describe, it, expect } from 'vitest';
import { buildGuardProfileExport, buildGuardProfileShareText } from '../guard-profile-export';
import type { GuardStyleEventInput } from '../guard-style-profile';

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0);

function guardEvent(day: number, savedAmount = 0, triggerId?: string): GuardStyleEventInput {
  return { eventType: 'challenge_completed', metadata: { savedAmount }, createdAt: d(day), triggerId };
}
function altEvent(day: number, estSaved = 0): GuardStyleEventInput {
  return { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', estSaved }, createdAt: d(day) };
}
function reuseEvent(day: number, estSaved = 0): GuardStyleEventInput {
  return { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved }, createdAt: d(day) };
}

const FULL_EVENTS: GuardStyleEventInput[] = [
  guardEvent(1, 40), guardEvent(1, 60), guardEvent(2, 100),
  altEvent(3, 25), reuseEvent(4, 50),
];

function fullInput(overrides: Record<string, unknown> = {}) {
  return buildGuardProfileExport({
    locale: 'zh',
    rawIntensity: 'strict',
    rawScope: { electronics: 'strict', beauty: 'exempt', bogus: 'strict', clothing: 42 },
    rawNightWindow: 'nightOwl',
    hourlyRate: 25,
    events: FULL_EVENTS,
    ...overrides,
  });
}

describe('buildGuardProfileExport — 全量导出', () => {
  it('配置摘要各态正确 (强度/范围逐键降级/深夜时段/时薪)', () => {
    const r = fullInput();
    expect(r.status).toBe('ok');
    expect(r.settings.intensity).toBe('strict');
    expect(r.settings.scope.electronics).toBe('strict');
    expect(r.settings.scope.beauty).toBe('exempt');
    // 未知品类键与非法模式值逐键降级, 合法键保留
    expect(r.settings.scope.clothing).toBe('guard');
    expect(r.settings.scope.food).toBe('guard');
    expect(r.settings.nightWindow).toBe('nightOwl');
    expect(r.settings.hourlyRate).toBe(25);
  });

  it('成果聚合: 三轨计数 / 累计省钱 / 自由小时 (275 / 25 = 11h)', () => {
    const r = fullInput();
    expect(r.stats).not.toBeNull();
    expect(r.stats!.trackCounts).toEqual({ guard: 3, alt: 1, reuse: 1 });
    expect(r.privateStats.totalSavedEstimate).toBeCloseTo(275, 6);
    expect(r.stats!.freedomHours).toBeCloseTo(11, 6);
  });

  it('完整版文本含金额与配置; 分享版含成果但不金额', () => {
    const r = fullInput();
    expect(r.fullText).toContain('$275');
    expect(r.fullText).toContain('坚决');
    expect(r.fullText).toContain('1 类加严 · 1 类豁免');
    expect(r.fullText).toContain('夜猫型 00:00–05:00');
    expect(r.fullText).toContain('拦截 3 次');
    expect(r.shareText).toContain('拦下了 3 次心动');
    expect(r.shareText).toContain('11 小时');
  });

  it('en 导出同结构', () => {
    const r = buildGuardProfileExport({
      locale: 'en',
      rawIntensity: 'gentle',
      rawScope: null,
      rawNightWindow: 'early',
      hourlyRate: 25,
      events: FULL_EVENTS,
    });
    expect(r.status).toBe('ok');
    expect(r.fullText).toContain('Gentle');
    expect(r.fullText).toContain('All categories guarded');
    expect(r.fullText).toContain('~$275');
    expect(r.shareText).toContain('3 impulses set down gently');
  });
});

describe('样本不足降级', () => {
  it('<5 事件 → insufficient: 只导出配置, 统计区 warm 提示, stats=null', () => {
    const r = buildGuardProfileExport({
      locale: 'zh',
      rawIntensity: 'gentle',
      events: [guardEvent(1, 30), guardEvent(2, 30)],
    });
    expect(r.status).toBe('insufficient');
    expect(r.stats).toBeNull();
    expect(r.privateStats.totalSavedEstimate).toBe(60);
    expect(r.fullText).toContain('我的配置');
    expect(r.fullText).toContain('温和');
    // 时薪行是配置的一部分照常导出, 但不出现成果省钱估算
    expect(r.fullText).toContain('$25/小时');
    expect(r.fullText).not.toContain('累计省钱估算');
    expect(r.fullText).toContain('满 5 次');
    expect(r.shareText).toContain('满 5 次');
    expect(r.shareText).not.toContain('$');
  });

  it('空事件 / null 事件同样降级不抛错', () => {
    for (const events of [[] as GuardStyleEventInput[], null]) {
      const r = buildGuardProfileExport({ locale: 'en', events });
      expect(r.status).toBe('insufficient');
      expect(r.shareText).toContain('after 5 guard actions');
    }
  });
});

describe('corrupt localStorage 输入逐项降级', () => {
  it('全部垃圾输入 → 全默认 (balanced / 全 guard / standard / $25)', () => {
    const r = buildGuardProfileExport({
      locale: 'zh',
      rawIntensity: 'mega-strict',
      rawScope: '{{{not json',
      rawNightWindow: { hours: [1, 2] },
      hourlyRate: Number.NaN,
      events: FULL_EVENTS,
    });
    expect(r.settings.intensity).toBe('balanced');
    expect(r.settings.scope.electronics).toBe('guard');
    expect(r.settings.nightWindow).toBe('standard');
    expect(r.settings.hourlyRate).toBe(25);
    expect(r.fullText).toContain('平衡');
    expect(r.fullText).toContain('全品类守护');
    expect(r.fullText).toContain('标准型 22:00–05:00');
    expect(r.fullText).toContain('$25/小时');
  });
});

describe('分享版 amount-free 红线 (结构性锁)', () => {
  const MONEY_PATTERN = /[$¥£€]|\d+\s*(元|美元|dollars?|USD)/i;

  it('全量 ok 分享文本不含任何货币符号/金额模式 (zh+en)', () => {
    for (const locale of ['zh', 'en']) {
      const r = buildGuardProfileExport({
        locale,
        rawIntensity: 'strict',
        rawScope: { electronics: 'strict' },
        rawNightWindow: 'early',
        hourlyRate: 40,
        events: FULL_EVENTS,
      });
      expect(r.status).toBe('ok');
      expect(r.shareText).not.toMatch(MONEY_PATTERN);
      // 次数/小时/天数允许出现
      expect(r.shareText).toMatch(/3/);
    }
  });

  it('insufficient 分享文本同样无金额', () => {
    const r = buildGuardProfileExport({ locale: 'zh', events: [] });
    expect(r.shareText).not.toMatch(MONEY_PATTERN);
  });

  it('buildGuardProfileShareText 入参类型无金额 — 传任何 stats 输出仍 amount-free', () => {
    const text = buildGuardProfileShareText(
      {
        intensity: 'balanced',
        scope: { electronics: 'guard', clothing: 'guard', beauty: 'guard', home: 'guard', food: 'guard' },
        nightWindow: 'standard',
        hourlyRate: 25,
      },
      {
        trackCounts: { guard: 999, alt: 5, reuse: 3 },
        activeDays: 42,
        styleId: 'interceptor',
        styleStreakDays: 7,
        freedomHours: 123.4,
      },
      'en',
    );
    expect(text).toContain('999');
    expect(text).toContain('123 hours');
    expect(text).not.toMatch(MONEY_PATTERN);
  });
});
