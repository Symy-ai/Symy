/**
 * batch77-a — MultiPlatformShare 平台白名单 + 金额红线 (testgap v9 §十五.2 装配层)
 *
 * 两道闸:
 *   1. 平台白名单: 可分享平台固定 10 个 — 直享组 native/X/Reddit/WhatsApp/Telegram/
 *      Email/Copy link + 存图引导组 Instagram/TikTok/WeChat; aria-label 全集必须
 *      精确等于白名单, 不得混入白名单外平台。
 *   2. 金额红线: text/url 由调用方传入且可能携带金额上下文 (如省了 $99 的文案),
 *      断言它们只进分享 intent, 永不进入渲染产物 (存图引导展开后复验一次)。
 * i18n mock 解析生产词典; 缺 key 回落 PLATFORMS label 默认值 (组件内建行为)。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MultiPlatformShare } from '../multi-platform-share';

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

/** 白名单 — aria-label 全集 (en: 前三取词典 shareNative/shareEmail/shareCopyLink) */
const WHITELIST_EN = ['Share', 'X', 'Reddit', 'WhatsApp', 'Telegram', 'Email', 'Copy link', 'Instagram', 'TikTok', 'WeChat'];
const WHITELIST_ZH = ['分享...', 'X', 'Reddit', 'WhatsApp', 'Telegram', '邮件', '复制链接', 'Instagram', 'TikTok', 'WeChat'];
const GUIDE_PLATFORMS = ['Instagram', 'TikTok', 'WeChat'];

/** 金额红线 — 数字 + 字段文案 (与 share-face-money-redline 同一套) */
const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

beforeEach(() => {
  locale = 'en';
});

describe('MultiPlatformShare platform whitelist', () => {
  it.each([['en', WHITELIST_EN], ['zh', WHITELIST_ZH]] as const)('renders exactly the whitelisted platforms (%s)', (lang, whitelist) => {
    locale = lang;
    const { container } = render(
      <MultiPlatformShare text="plain face text" url="https://symy.ai/?ref=ABC" />
    );
    const buttons = Array.from(container.querySelectorAll('button[aria-label]'));
    const labels = buttons.map((b) => b.getAttribute('aria-label')).sort();
    expect(labels).toEqual([...whitelist].sort());
    // 存图引导组固定 3 个 — 白名单结构不漂移
    const guideLabels = buttons
      .filter((b) => GUIDE_PLATFORMS.includes(b.getAttribute('aria-label') ?? ''))
      .map((b) => b.getAttribute('aria-label'));
    expect(guideLabels).toHaveLength(GUIDE_PLATFORMS.length);
  });

  it('keeps the save-image guide group visually separated (3 platforms, hint row present)', () => {
    const { container } = render(<MultiPlatformShare text="plain face text" url="https://symy.ai" />);
    // 组件根 = container 内唯一节点; 其子层 = 直享组行 + 存图引导组行
    const root = container.firstElementChild as HTMLElement;
    expect(root.children.length).toBeGreaterThanOrEqual(2);
    expect(root.textContent).toContain('Save image → open app:');
  });
});

describe('MultiPlatformShare money red line', () => {
  it.each(['en', 'zh'] as const)('caller text/url with money never leaks into the DOM (%s)', (lang) => {
    locale = lang;
    // 攻击性输入: text/url 带满金额 — 组件只把它们拼进分享 intent, 不上 DOM
    const { container } = render(
      <MultiPlatformShare
        text="I saved $12.34 — 30 元 less, 50 CNY kept in total 金额"
        url="https://symy.ai/?amount=¥99"
      />
    );
    const text0 = container.textContent ?? '';
    expect(text0).not.toContain('$12.34');
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = text0.match(re);
      expect(hit, `MultiPlatformShare [${lang}] renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });

  it('opening the image-save guide keeps the DOM money-free', () => {
    const { container } = render(
      <MultiPlatformShare
        text="I saved $12.34 — 30 元 less"
        url="https://symy.ai/?amount=¥99"
      />
    );
    fireEvent.click(container.querySelector('button[aria-label="Instagram"]') as HTMLButtonElement);
    const text = container.textContent ?? '';
    // en 词典 shareToInstagram = "Instagram" (zh 才是 "分享到 …"); 引导箱以步骤文案为证
    expect(text).toContain('download the card');
    expect(text).toContain('Got it');
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = text.match(re);
      expect(hit, `guide DOM renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });
});
