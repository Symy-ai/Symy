import { describe, expect, it } from 'vitest';
import {
  formatDiaryHours,
  generateGuardDiary,
  localDateKey,
  type GuardDiaryEventInput,
} from '@/lib/guard-diary';

/** 生成一条当日事件 (本地 12:00, 非深夜) */
function dayEvent(overrides: Partial<GuardDiaryEventInput> = {}): GuardDiaryEventInput {
  return {
    createdAt: '2026-09-08T12:00:00',
    metadata: { amount: 50, category: 'clothing' },
    ...overrides,
  };
}

/** 生成一条深夜事件 (本地 23:30) */
function nightEvent(overrides: Partial<GuardDiaryEventInput> = {}): GuardDiaryEventInput {
  return dayEvent({ createdAt: '2026-09-08T23:30:00', ...overrides });
}

describe('generateGuardDiary', () => {
  it('零守护 → companion 版: 无金额无羞辱, guardCount=0', () => {
    const diary = generateGuardDiary([], { locale: 'zh', date: '2026-09-08' });
    expect(diary.variant).toBe('companion');
    expect(diary.guardCount).toBe(0);
    expect(diary.estSaved).toBe(0);
    expect(diary.text).not.toMatch(/\d/);
    expect(diary.text).toContain('🐘');
    expect(diary.text).not.toContain('没忍住');
  });

  it('标准形态: 次数/小时进文案, 金额永不进文案', () => {
    const diary = generateGuardDiary(
      [dayEvent({ metadata: { amount: 50, category: 'other-stuff' } })],
      { locale: 'zh', hourlyRate: 25, date: '2026-09-08' },
    );
    expect(diary.variant).toBe('standard');
    expect(diary.text).toContain('1');
    expect(diary.text).toContain('2'); // 50/25 = 2 小时
    expect(diary.text).not.toMatch(/[$¥€]/);
    // 金额只在结构化字段 (私有面)
    expect(diary.estSaved).toBe(50);
    expect(diary.hoursReclaimed).toBe(2);
  });

  it('深夜守护 → night 版, nightGuardCount 计数', () => {
    const diary = generateGuardDiary(
      [nightEvent(), nightEvent({ metadata: { amount: 25, category: 'electronics' } })],
      { locale: 'zh', date: '2026-09-08' },
    );
    expect(diary.variant).toBe('night');
    expect(diary.nightGuardCount).toBe(2);
    expect(diary.guardCount).toBe(2);
    expect(diary.text).toContain('2 次');
    expect(diary.text).toContain('3'); // 75/25 = 3 小时
  });

  it('品类之最 (无深夜) → category 版, 文案含品类名', () => {
    const diary = generateGuardDiary(
      [
        dayEvent({ metadata: { amount: 100, category: 'beauty' } }),
        dayEvent({ metadata: { amount: 100, category: 'beauty' } }),
        dayEvent({ metadata: { amount: 100, category: 'home' } }),
      ],
      { locale: 'zh', date: '2026-09-08' },
    );
    expect(diary.variant).toBe('category');
    expect(diary.topCategory).toBe('beauty');
    expect(diary.text).toContain('美妆');
  });

  it('en 双语模板', () => {
    const en = generateGuardDiary([dayEvent()], { locale: 'en', date: '2026-09-08' });
    expect(en.text).toContain('elephant');
    const zero = generateGuardDiary([], { locale: 'en', date: '2026-09-08' });
    expect(zero.text).toContain('elephant');
    const night = generateGuardDiary([nightEvent()], { locale: 'en', date: '2026-09-08' });
    expect(night.text).toMatch(/night|midnight|Late/i);
  });

  it('同日期同数据 → 文案确定性 (轮换按日期哈希); 不同日期可轮换', () => {
    const a = generateGuardDiary([dayEvent()], { locale: 'zh', date: '2026-09-08' });
    const b = generateGuardDiary([dayEvent()], { locale: 'zh', date: '2026-09-08' });
    expect(a.text).toBe(b.text);
    // 扫一周, 至少出现两套模板 (轮换有效)
    const texts = new Set<string>();
    for (let d = 1; d <= 7; d += 1) {
      texts.add(generateGuardDiary([dayEvent()], { locale: 'zh', date: `2026-09-0${d}` }).text);
    }
    expect(texts.size).toBeGreaterThanOrEqual(2);
  });

  it('hourlyRate 非法回退 25; amount 缺失事件仍计数但不计钱', () => {
    const diary = generateGuardDiary(
      [dayEvent({ metadata: null }), dayEvent({ metadata: { amount: 25 } })],
      { locale: 'zh', hourlyRate: Number.NaN, date: '2026-09-08' },
    );
    expect(diary.guardCount).toBe(2);
    expect(diary.estSaved).toBe(25);
    expect(diary.hoursReclaimed).toBe(1);
  });
});

describe('formatDiaryHours / localDateKey', () => {
  it('小时格式: 1.5 → 1.5, 2.0 → 2, 非法 → 0', () => {
    expect(formatDiaryHours(1.54)).toBe('1.5');
    expect(formatDiaryHours(2)).toBe('2');
    expect(formatDiaryHours(Number.NaN)).toBe('0');
  });

  it('localDateKey 输出 YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 8, 8))).toBe('2026-09-08');
  });
});
