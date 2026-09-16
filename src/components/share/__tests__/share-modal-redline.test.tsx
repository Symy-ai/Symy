/**
 * batch77-a — ShareModal (share 装配层) 金额红线·生产词典全模板扫描 (testgap v9 §十五.2 find 补充)
 *
 * card-templates.test.tsx 的红线套件在自带 mock 词典下测模板本体; 本文件补装配层:
 * 生产 en.json/zh.json 词典解析 t(), 传入全部 9 款模板数据, 逐 chip 切换后断言
 * 整个 portal DOM (标题 + chips + 卡面预览 + 私密提示行 + 操作条) 零金额。
 * 私密提示行 (private-saved-hint) 是 owner 铁律的「里子留在 app 内」通道 —
 * 断言其存在且只出小时 (moneyToFreedomLabel 产物), 钉住现状防回潮:
 * 分享图只从 cardRef 生成, 私密行永不进图。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ShareModal } from '../share-modal';
import type { BadgeDef } from '@/components/buddy/constants';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';

const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

let locale: 'en' | 'zh' = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = locale === 'zh' ? flat(zhMsgs) : flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));
// toPng 直接成功 — 不真加载 CDN (html-to-image-loader 有自己的测试)
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 20 }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

const badgeDef: BadgeDef = {
  id: 'green_guardian_10',
  emoji: '🌿',
  color: 'bg-green-500/10 border-green-500/20',
  unlockConditionKey: 'buddy.badgeUnlock.green_guardian_10',
  progressTarget: 10,
  progressType: 'challenge_wins',
  group: 'guardian',
};

const challengeDef = {
  id: 'daily_green_gate',
  period: 'daily',
  titleKey: 'buddy.challengeLib.challenges.daily_green_gate.title',
  descKey: 'buddy.challengeLib.challenges.daily_green_gate.desc',
  doneTitleKey: 'buddy.challengeLib.challenges.daily_green_gate.done',
  progressSource: 'today_see_it',
  target: 1,
  rewardBadgeId: 'impulse_shield',
} as unknown as GuardianChallenge;

/** 全量模板数据 — 9 款 chip 全部出现的满配场景 */
const fullProps = {
  medal: { itemTitle: 'Air Fryer', savedCents: 8900 },
  streakDays: 12,
  interceptCount: 23,
  badgeCard: { badge: badgeDef, progressValue: 23 },
  challengeCard: { challenge: challengeDef },
  weeklyCard: { guardDays: 5, intercepts: 3, streakDays: 2, savedHours: 12.4 },
  dreamFund: { name: 'Camera', savedCents: 9000, streakDays: 3 },
  guardRank: { name: 'Green Guardian', level: 2, emoji: '🛡️' },
  inviteCard: { refCode: 'GREEN2026', completedCount: 4 },
};

const TEMPLATE_IDS = [
  'intercept',
  'streak',
  'milestone',
  'badge',
  'challenge',
  'weekly',
  'dream',
  'guardian-stats',
  'invite',
] as const;

beforeEach(() => {
  locale = 'en';
  toPngMock.mockReset();
  toPngMock.mockResolvedValue('data:image/png;base64,AAA');
});

describe('ShareModal assembly money red line (real dictionaries, all 9 templates)', () => {
  it.each(TEMPLATE_IDS.map((id) => [id, 'en'] as const))('template "%s" renders zero money across the whole modal (%s)', async (id) => {
    locale = 'en';
    render(<ShareModal open onClose={() => {}} {...fullProps} />);

    fireEvent.click(getChip(id));
    await waitFor(() => expect(getChip(id).getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    const domText = document.body.textContent ?? '';
    expect(domText).toContain('Share'); // 操作条仍在 — 非空渲染的假绿防护
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = domText.match(re);
      expect(hit, `ShareModal[${id}] renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });

  it.each(TEMPLATE_IDS.map((id) => [id, 'zh'] as const))('template "%s" renders zero money across the whole modal (%s)', async (id) => {
    locale = 'zh';
    render(<ShareModal open onClose={() => {}} {...fullProps} />);

    fireEvent.click(getChip(id));
    await waitFor(() => expect(getChip(id).getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    const domText = document.body.textContent ?? '';
    expect(domText).toContain('保存图片');
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = domText.match(re);
      expect(hit, `ShareModal[${id}] renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });

  it('keeps the private saved hint in-app: present, hours-only, never money', async () => {
    render(<ShareModal open onClose={() => {}} {...fullProps} />);
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 8900¢ ÷ 100 ÷ $20 = 4.45h → formatFreedomTime = "4.5 hours" / "4.5 小时" — 面子数字, 非金额
    const hint = document.body.querySelector('[data-testid="private-saved-hint"]');
    expect(hint).not.toBeNull();
    const hintText = hint?.textContent ?? '';
    expect(hintText).toMatch(/4\.5 (hours|小时)/);
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = hintText.match(re);
      expect(hit, `private hint renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
    // 全部 9 款 chip 都在 — 装配层没有静默吞模板
    for (const id of TEMPLATE_IDS) {
      expect(getChip(id)).not.toBeNull();
    }
  });
});

/** portal 渲染在 document.body — chip 要从 body 里找 */
function getChip(id: string): HTMLElement {
  return document.body.querySelector(`[data-testid="template-chip-${id}"]`) as HTMLElement;
}
