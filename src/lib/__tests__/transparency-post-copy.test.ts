/**
 * Tests for buildWeeklyPostCopy (batch89-a) — 周报发帖文案纯函数
 *
 * - zh/en 双语快照: 模板逐字节钉死 (拦截/小时/守护者 + 链接 + hashtag + 尾签)
 * - 金额红线 (最高优先): 入参类型 Pick 三非金额指标; 即使把含 savedUsd 的
 *   完整快照整个传入 (结构子类型合法), 产物也零货币符号/金额词
 * - 占位符替换: 产物无残留花括号, 数字以 Intl 口径正确进文案; 负数钳 0
 * - 纪律: ≤280 chars (X 发布上限), 无 FOMO 词, 纯函数确定性 (冻结入参)
 */

import { describe, it, expect } from 'vitest';

import { buildWeeklyPostCopy } from '@/lib/transparency-post-copy';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';

const FIXTURE = {
  intercepts: { week: 128 },
  hoursWon: { week: 32.5 },
  guards: 1042,
};

/** 完整公开快照 — savedUsd/co2SavedKg 大额在场, 用于证明金额结构性不可达 */
const FULL_SNAPSHOT: TransparencySnapshot = {
  weekStart: '2026-09-14T00:00:00.000Z',
  weekEnd: '2026-09-18T12:00:00.000Z',
  intercepts: { week: 128, total: 900 },
  savedUsd: { week: 3200, total: 24000 },
  hoursWon: { week: 32.5, total: 240 },
  co2SavedKg: { week: 112, total: 840 },
  lastWeek: { intercepts: 100, savedUsd: 3000, hoursWon: 30, co2SavedKg: 105 },
  guards: 1042,
  generatedAt: '2026-09-18T12:00:00.000Z',
  degraded: false,
};

const FOMO = /仅剩|最后|限时|限量|马上抢|错过再|倒计时|hurry|last chance|only \d+ left|running out|don'?t miss|act now/i;

const ZH_EXPECTED =
  '本周 Symy 拦截了 128 次冲动下单，帮用户赢回 32.5 小时，1,042 位守护者同行。' +
  '每周数据，全部公开：\nhttps://symy.ai/transparency\n\n#BuildInPublic #Symy\nBefore you buy it, Symy it.';

const EN_EXPECTED =
  'This week Symy intercepted 128 impulse buys and won 32.5 hours back, with 1,042 guardians alongside. ' +
  'Every week, all in the open:\nhttps://symy.ai/transparency\n\n#BuildInPublic #Symy\nBefore you buy it, Symy it.';

describe('buildWeeklyPostCopy — bilingual snapshots', () => {
  it('renders the zh template byte-for-byte with all three metrics + link + hashtags + signature', () => {
    expect(buildWeeklyPostCopy(FIXTURE, 'zh')).toBe(ZH_EXPECTED);
  });

  it('renders the en template byte-for-byte', () => {
    expect(buildWeeklyPostCopy(FIXTURE, 'en')).toBe(EN_EXPECTED);
  });

  it('formats intercepts/guards as integers and hours with at most 1 decimal', () => {
    const copy = buildWeeklyPostCopy(
      { intercepts: { week: 7 }, hoursWon: { week: 38.46 }, guards: 13 },
      'zh',
    );
    expect(copy).toContain('拦截了 7 次');
    expect(copy).toContain('赢回 38.5 小时'); // maximumFractionDigits: 1
    expect(copy).toContain('13 位守护者');
  });

  it('clamps negatives to 0 (page formatInt 同款防御)', () => {
    const copy = buildWeeklyPostCopy(
      { intercepts: { week: -5 }, hoursWon: { week: -1.2 }, guards: -3 },
      'en',
    );
    expect(copy).toContain('intercepted 0 impulse buys');
    expect(copy).toContain('won 0 hours back');
    expect(copy).toContain('with 0 guardians');
  });

  it('falls back to en for any non-zh locale (页面只有 zh/en)', () => {
    expect(buildWeeklyPostCopy(FIXTURE, 'fr')).toBe(EN_EXPECTED);
  });
});

describe('buildWeeklyPostCopy — placeholder & purity', () => {
  it('leaves no unfilled {placeholder} braces in the output', () => {
    for (const locale of ['zh', 'en']) {
      expect(buildWeeklyPostCopy(FIXTURE, locale)).not.toMatch(/[{}]/);
    }
  });

  it('is deterministic and accepts a frozen input (同输入逐字节同输出)', () => {
    const frozen = Object.freeze({
      intercepts: Object.freeze({ week: 128 }),
      hoursWon: Object.freeze({ week: 32.5 }),
      guards: 1042,
    });
    expect(buildWeeklyPostCopy(frozen, 'zh')).toBe(buildWeeklyPostCopy(frozen, 'zh'));
  });
});

describe('buildWeeklyPostCopy — money red line (最高优先)', () => {
  it('never leaks amounts even when handed the FULL snapshot incl. savedUsd', () => {
    for (const locale of ['zh', 'en']) {
      const copy = buildWeeklyPostCopy(FULL_SNAPSHOT, locale);
      expect(copy).not.toMatch(/[$¥€£]/);
      expect(copy).not.toContain('3,200');
      expect(copy).not.toContain('24,000');
      expect(copy).not.toContain('24000');
      expect(copy).not.toContain('美元');
      expect(copy).not.toMatch(/saved|amount/i);
    }
  });

  it('zh copy never carries 金额词 (省/花/元)', () => {
    const copy = buildWeeklyPostCopy(FULL_SNAPSHOT, 'zh');
    expect(copy).not.toContain('省');
    expect(copy).not.toContain('花');
    expect(copy).not.toMatch(/[\d,]+\s*元/);
  });
});

describe('buildWeeklyPostCopy — post discipline', () => {
  it('stays within the 280-char X limit in both locales', () => {
    for (const locale of ['zh', 'en']) {
      expect(buildWeeklyPostCopy(FULL_SNAPSHOT, locale).length).toBeLessThanOrEqual(280);
    }
  });

  it.each([
    ['zh', ZH_EXPECTED],
    ['en', EN_EXPECTED],
  ])('keeps the %s post copy free of FOMO phrasing', (_locale, copy) => {
    expect(copy).not.toMatch(FOMO);
  });

  it('always carries the link, hashtags and the brand signature', () => {
    for (const locale of ['zh', 'en']) {
      const copy = buildWeeklyPostCopy(FULL_SNAPSHOT, locale);
      expect(copy).toContain('https://symy.ai/transparency');
      expect(copy).toContain('#BuildInPublic #Symy');
      expect(copy).toContain('Before you buy it, Symy it.');
    }
  });
});
