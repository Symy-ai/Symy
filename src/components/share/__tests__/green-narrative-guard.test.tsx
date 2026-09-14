/**
 * Green narrative guard (batch7-a) — 分享域守护叙事守卫
 *
 * 两道闸:
 *   1. 旧词清零: 分享域源文件 (5 模板 + card-templates + share-modal + 进度卡)
 *      与 i18n share.* / buddy.share* 段 (en/zh, key 名+值) grep 不到
 *      mirror/魔镜/镜子/照见/freedom/seeing — 旧魔镜哲学词汇在传播面清零。
 *   2. 导出面金额红线 (进度卡): 5 模板的同款守卫在 card-templates.test.tsx
 *      red line suite; 进度卡是 canvas 绘制, textContent 拿不到 —
 *      这里 mock 2d context 捕获全部 fillText, 断言零货币符号/零两位小数金额。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';
import type { BuddyState } from '@/types/buddy-state';

// 旧魔镜哲学词表 — mirror 哲学 (mirror/seeing) + 旧 "hours of freedom" 口径
const OLD_VOCAB = /mirror|魔镜|镜子|照见|freedom|seeing/i;

// owner 铁律 (09-06) 豁免: freedom-time 换算 helper 是官方权威 (src/lib/freedom-time.ts),
// 标识符/导入路径含 "freedom" 不属于旧文案 — 只豁免代码标识符, 字符串文案照抓。
const HELPER_IDENTIFIERS = /@\/lib\/freedom-time|moneyToFreedomLabel|formatFreedomTime|moneyToHours/g;

/** 分享域源文件 — 导出/传播面上的全部文案都住在这里 (含注释, 守卫从紧) */
const SHARE_SURFACE_FILES = [
  'src/components/share/badge-card.tsx',
  'src/components/share/card-templates.tsx',
  'src/components/share/challenge-card.tsx',
  'src/components/share/intercept-card.tsx',
  'src/components/share/milestone-card.tsx',
  'src/components/share/share-modal.tsx',
  'src/components/share/streak-card.tsx',
  'src/components/buddy/share-card-modal.tsx',
];

function leaves(node: unknown, prefix = ''): Array<{ key: string; value: string }> {
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [{ key: prefix, value: String(node) }];
}

/** i18n share.* 段 + buddy.share* 段的全部叶子 (key 名与值一起过守卫) */
function shareI18nEntries(dict: Record<string, unknown>): Array<{ key: string; value: string }> {
  const share = leaves(dict.share).map((e) => ({ ...e, key: `share.${e.key}` }));
  const buddyShare = leaves(dict.buddy)
    .filter((e) => e.key.startsWith('share'))
    .map((e) => ({ ...e, key: `buddy.${e.key}` }));
  return [...share, ...buddyShare];
}

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let out = params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') out = out.replace(`{${k}}`, String(v));
        }
      }
      return out;
    },
    locale: 'en',
  }),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 20 }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));
vi.mock('@/components/common/multi-platform-share', () => ({ MultiPlatformShare: () => null }));

describe('green narrative guard: mirror-era vocab is gone from the share surface', () => {
  it.each(SHARE_SURFACE_FILES)('%s carries no mirror/freedom-era vocab', (relPath) => {
    const source = readFileSync(path.resolve(process.cwd(), relPath), 'utf8').replace(HELPER_IDENTIFIERS, '');
    const hit = source.match(OLD_VOCAB);
    expect(hit, `${relPath} still carries old vocab: "${hit?.[0]}"`).toBeNull();
  });

  it('i18n share.*/buddy.share* sections (en + zh, keys and values) are clean', () => {
    for (const [lang, dict] of [['en', en], ['zh', zh]] as const) {
      for (const { key, value } of shareI18nEntries(dict)) {
        expect(`${key} = ${value}`, `${lang} ${key}`).not.toMatch(OLD_VOCAB);
      }
    }
  });
});

describe('export red line: progress card canvas never renders money', () => {
  const captured: string[] = [];

  beforeAll(() => {
    // happy-dom 没有 2d context — 用桩捕获全部 fillText 文字
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: (text: string) => {
        captured.push(String(text));
      },
      measureText: (s: string) => ({ width: s.length * 20 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,stub');
  });

  it('draws won-back hours + honor numbers only — no currency, no 2-decimal money', async () => {
    const { ShareCardModal } = await import('@/components/buddy/share-card-modal');

    // current=90, 时薪 20 → 赢回 4.5 小时 (卡上只出小时, 不出 $90)
    const buddyState = {
      dreamFunds: [{ id: 'df-camera', name: 'Camera', target: 400, current: 90, emoji: '📷' }],
      streak: 12,
      level: 3,
      vitality: 87.5,
    } as unknown as BuddyState;

    render(<ShareCardModal open onClose={() => {}} buddyState={buddyState} aiQuote="Proud of you." />);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));

    for (const text of captured) {
      expect(text, `canvas text "${text}" carries money`).not.toMatch(/[$¥€£]/);
      expect(text).not.toMatch(/\bUSD\b|\bCNY\b/);
      expect(text, `canvas text "${text}" looks like a money amount`).not.toMatch(/\d+\.\d{2}\b/);
    }

    // 英雄数字 (赢回的小时) 在卡上 — 面子仍在
    expect(captured).toContain('4.5');
  });
});
