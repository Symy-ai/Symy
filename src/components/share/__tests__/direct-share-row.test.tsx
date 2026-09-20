/**
 * batch106-a — DirectShareRow 四平台直链分享行 (BP p19「to protect others」传播层)
 *
 * 五道闸:
 *   1. 直链 URL: X 落 x.com/intent/post 且文案=caption+契约句、url=归因链接 (全编码);
 *      Reddit submit 的 title/url 双参 round-trip — X/Reddit 点击不触 PNG 下载。
 *   2. 诚实降级: IG/TikTok 无 web intent → 保存图片 + 复制文案 + 打开 app 真实主页 +
 *      内联提示; 剪贴板失败/不存在走手动话术, 不静默、不假装直连。
 *   3. PNG 未生成时 IG/TikTok 如实禁用 (无图可存), X/Reddit 纯链接不受影响。
 *   4. 金额红线 (owner 09-06): caption/url 带满金额也只进 intent 与剪贴板, 永不上 DOM。
 *   5. 契约叙事与文案纪律: share.toProtectQuote + directShare.* 词典 en/zh 双侧非空、
 *      无 FOMO 营销腔; 组件源码零 defaultValue (缺 key 时裸 key 暴露, 不静默兜底)。
 * 末组: ShareModal 装配集成 — 直链行真实入弹窗, X 链带模板文案+契约句 (生产词典)。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { DirectShareRow } from '../direct-share-row';
import { ShareModal } from '../share-modal';

const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8')) as Record<string, unknown>;
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8')) as Record<string, unknown>;

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
            if (k !== 'defaultValue') result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

// ShareModal 集成组 — 与 share-modal-redline 同款 mock 面
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 20 }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));

/** FOMO 营销腔禁词 — 与 transparency share-button 守卫同一张表 */
const FOMO_RE = /仅剩|最后|限时|限量|马上抢|错过再|倒计时|hurry|last chance|only \d+ left|running out|don'?t miss|act now/i;

/** 金额红线 — 与 share-face-money-redline 同一套 */
const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

const CAPTION = 'I skipped an impulse buy and won back 4.5 hours. Buy less. Live more.';
const SHARE_URL = 'https://symy.ai/?ref=GR33N';

function stubClipboard(impl?: () => Promise<void>): ReturnType<typeof vi.fn> | undefined {
  const writeText = impl ? vi.fn(impl) : undefined;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
  return writeText;
}

beforeEach(() => {
  locale = 'en';
  stubClipboard(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderRow(overrides: Partial<Parameters<typeof DirectShareRow>[0]> = {}) {
  const onDownload = vi.fn();
  const utils = render(
    <DirectShareRow
      caption={CAPTION}
      url={SHARE_URL}
      quote={locale === 'zh' ? String((zhMsgs.share as Record<string, unknown>).toProtectQuote) : String((enMsgs.share as Record<string, unknown>).toProtectQuote)}
      onDownload={onDownload}
      imageReady
      {...overrides}
    />
  );
  return { onDownload, ...utils };
}

function rowButton(testid: string): HTMLButtonElement {
  return document.body.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
}

describe('DirectShareRow direct-link URLs', () => {
  it('X opens x.com/intent/post with caption + to-protect quote + url, all encoded', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onDownload } = renderRow();
    fireEvent.click(rowButton('direct-share-x'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [intent, target] = openSpy.mock.calls[0] as [string, string];
    expect(intent.startsWith('https://x.com/intent/post?')).toBe(true);
    expect(target).toBe('_blank');
    const parsed = new URL(intent);
    const quote = String((enMsgs.share as Record<string, unknown>).toProtectQuote);
    expect(parsed.searchParams.get('text')).toBe(`${CAPTION}\n${quote}`);
    expect(parsed.searchParams.get('url')).toBe(SHARE_URL);
    // 直链不碰 PNG — 下载只属于降级支路
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('Reddit opens reddit.com/submit with title and url round-trip', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRow();
    fireEvent.click(rowButton('direct-share-reddit'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const parsed = new URL(openSpy.mock.calls[0][0] as string);
    expect(parsed.origin + parsed.pathname).toBe('https://www.reddit.com/submit');
    expect(parsed.searchParams.get('title')).toBe(CAPTION);
    expect(parsed.searchParams.get('url')).toBe(SHARE_URL);
  });

  it('zh locale: X text carries the zh contract sentence from the real dictionary', () => {
    locale = 'zh';
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRow();
    fireEvent.click(rowButton('direct-share-x'));

    const parsed = new URL(openSpy.mock.calls[0][0] as string);
    expect(parsed.searchParams.get('text')).toBe(`${CAPTION}\n每一次分享，都是在保护别人不被诱导。`);
  });
});

describe('DirectShareRow honest degrade (no web intent on IG/TikTok)', () => {
  it('Instagram: saves image + copies caption/quote/url + opens real home + inline hint', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const writeText = stubClipboard(() => Promise.resolve());
    const { onDownload } = renderRow();
    fireEvent.click(rowButton('direct-share-instagram'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toBe('https://www.instagram.com/');
    expect(writeText).toHaveBeenCalledWith(`${CAPTION}\n${(enMsgs.share as Record<string, unknown>).toProtectQuote}\n${SHARE_URL}`);
    await waitFor(() => {
      const hint = document.body.querySelector('[data-testid="direct-share-hint"]');
      expect(hint?.textContent).toBe(String((enMsgs.share as Record<string, Record<string, string>>).directShare.appGuideCopied));
    });
  });

  it('TikTok: same degrade chain, opens tiktok.com home', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onDownload } = renderRow();
    fireEvent.click(rowButton('direct-share-tiktok'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toBe('https://www.tiktok.com/');
  });

  it('clipboard rejection falls through to the manual wording — degrade never goes silent', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const { onDownload } = renderRow();
    fireEvent.click(rowButton('direct-share-instagram'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const hint = document.body.querySelector('[data-testid="direct-share-hint"]');
      expect(hint?.textContent).toBe(String((enMsgs.share as Record<string, Record<string, string>>).directShare.appGuideNoCopy));
    });
  });

  it('no clipboard capability at all: still degrades honestly (manual wording)', async () => {
    stubClipboard(undefined);
    const { onDownload } = renderRow();
    fireEvent.click(rowButton('direct-share-instagram'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const hint = document.body.querySelector('[data-testid="direct-share-hint"]');
      expect(hint?.textContent).toBe(String((enMsgs.share as Record<string, Record<string, string>>).directShare.appGuideNoCopy));
    });
  });

  it('imageReady=false: IG/TikTok truthfully disabled (no image to save), X/Reddit stay live', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onDownload } = renderRow({ imageReady: false });

    expect(rowButton('direct-share-instagram').disabled).toBe(true);
    expect(rowButton('direct-share-tiktok').disabled).toBe(true);
    expect(rowButton('direct-share-x').disabled).toBe(false);
    expect(rowButton('direct-share-reddit').disabled).toBe(false);

    fireEvent.click(rowButton('direct-share-instagram'));
    expect(onDownload).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="direct-share-hint"]')).toBeNull();
  });
});

describe('DirectShareRow i18n surface', () => {
  it.each([['en', ['Share on X', 'Share on Reddit']], ['zh', ['分享到 X', '分享到 Reddit']]] as const)('renders exactly the four platform buttons with dictionary labels (%s)', (lang, directLabels) => {
    locale = lang;
    const { container } = renderRow();
    const labels = Array.from(container.querySelectorAll('button[aria-label]')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toHaveLength(4);
    const dict = (lang === 'zh' ? zhMsgs : enMsgs).share as Record<string, Record<string, string>>;
    expect(labels).toEqual(expect.arrayContaining([
      dict.directShare.x,
      dict.directShare.reddit,
      dict.directShare.instagram,
      dict.directShare.tiktok,
    ]));
    expect(labels).toEqual(expect.arrayContaining([...directLabels]));
  });

  it('contract sentence + degrade copy exist in BOTH dictionaries, protective not promotional', () => {
    for (const [lang, msgs] of [['en', enMsgs], ['zh', zhMsgs]] as const) {
      const share = msgs.share as Record<string, unknown>;
      const quote = String(share.toProtectQuote);
      expect(quote.length).toBeGreaterThan(0);
      const direct = share.directShare as Record<string, string>;
      for (const value of Object.values(direct)) {
        expect(value.length).toBeGreaterThan(0);
      }
      if (lang === 'en') expect(quote).toMatch(/protect/i);
      else expect(quote).toContain('保护');
    }
  });

  it('share-domain copy stays free of FOMO phrasing (both locales)', () => {
    for (const msgs of [enMsgs, zhMsgs]) {
      const share = msgs.share as Record<string, unknown>;
      const texts = [String(share.toProtectQuote), ...Object.values(share.directShare as Record<string, string>)];
      for (const text of texts) {
        expect(text.match(FOMO_RE), `FOMO phrasing leaked: "${text}"`).toBeNull();
      }
    }
  });

  it('new keys are wired without defaultValue — missing keys surface as raw keys, never silently', () => {
    const rowSource = readFileSync('src/components/share/direct-share-row.tsx', 'utf8');
    expect(rowSource).not.toContain('defaultValue');
    const modalSource = readFileSync('src/components/share/share-modal.tsx', 'utf8');
    expect(modalSource).toContain("t('share.toProtectQuote')");
  });
});

describe('DirectShareRow money red line', () => {
  it('caller caption/url carrying money only feed intents — never the DOM', () => {
    const { container } = render(
      <DirectShareRow
        caption="I saved $12.34 — 30 元 less, 50 CNY kept. 金额"
        url="https://symy.ai/?amount=¥99"
        quote="Every share helps protect someone else."
        onDownload={() => {}}
        imageReady
      />
    );
    const text = container.textContent ?? '';
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = text.match(re);
      expect(hit, `DirectShareRow renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });
});

describe('ShareModal integration: direct row is really wired in', () => {
  it('modal renders the four-platform row; X link carries the template caption + contract quote', async () => {
    locale = 'en';
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <ShareModal
        open
        onClose={() => {}}
        medal={{ itemTitle: 'Air Fryer', savedCents: 8900 }}
      />
    );
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());
    await waitFor(() => expect(rowButton('direct-share-instagram').disabled).toBe(false));

    fireEvent.click(rowButton('direct-share-x'));
    const parsed = new URL(openSpy.mock.calls[0][0] as string);
    const text = parsed.searchParams.get('text') ?? '';
    const template = String((enMsgs.share as Record<string, Record<string, string>>).interceptMedal.shareText);
    const prefix = template.slice(0, template.indexOf('{hours}'));
    expect(text.startsWith(prefix)).toBe(true);
    expect(text.endsWith(String((enMsgs.share as Record<string, unknown>).toProtectQuote))).toBe(true);
    expect(parsed.searchParams.get('url')).toBe(window.location.origin);
  });
});
