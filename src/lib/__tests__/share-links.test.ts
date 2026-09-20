/**
 * batch106-a — share-links 直链构造纯函数
 *
 * 钉三件事:
 *   1. X intent 落在 x.com 当前域名端点, text 先于 url (BP p19「四平台直链」的 X 支路)
 *   2. 全参 encodeURIComponent — 文案里的空格/换行/&#?/CJK 经 URL round-trip 不丢不截断,
 *      带 query 的分享链接 (ref 归因) 不会被 intent 吞成自己的参数
 *   3. Reddit submit 的 title/url 双参数 round-trip; IG/TikTok 主页是真实降级目标
 */

import { describe, it, expect } from 'vitest';
import {
  buildXIntentUrl,
  buildRedditSubmitUrl,
  INSTAGRAM_HOME_URL,
  TIKTOK_HOME_URL,
} from '../share-links';

const CAPTION = 'I skipped an impulse buy and won back 4.5 hours. Buy less. Live more.';
const QUOTE = '每一次分享，都是在保护别人不被诱导。';
const SHARE_URL = 'https://symy.ai/?ref=GR33N';

describe('buildXIntentUrl', () => {
  it('targets the x.com post intent with text before url', () => {
    const out = buildXIntentUrl({ text: 'hi', url: SHARE_URL });
    expect(out.startsWith('https://x.com/intent/post?')).toBe(true);
    expect(out.indexOf('text=')).toBeGreaterThan(-1);
    expect(out.indexOf('text=')).toBeLessThan(out.indexOf('url='));
  });

  it('survives a full URL round-trip — newlines, CJK and punctuation intact', () => {
    const text = `${CAPTION}\n${QUOTE}`;
    const parsed = new URL(buildXIntentUrl({ text, url: SHARE_URL }));
    expect(parsed.origin + parsed.pathname).toBe('https://x.com/intent/post');
    expect(parsed.searchParams.get('text')).toBe(text);
    expect(parsed.searchParams.get('url')).toBe(SHARE_URL);
  });

  it('encodes & so a ref-tagged url cannot leak params as intent keys', () => {
    const out = buildXIntentUrl({ text: 'a&b=c', url: 'https://symy.ai/?ref=A&x=1' });
    expect(out).not.toContain('a&b=c');
    const parsed = new URL(out);
    expect(Array.from(parsed.searchParams.keys()).sort()).toEqual(['text', 'url']);
    expect(parsed.searchParams.get('url')).toBe('https://symy.ai/?ref=A&x=1');
  });
});

describe('buildRedditSubmitUrl', () => {
  it('targets reddit submit with title and url round-trip', () => {
    const out = buildRedditSubmitUrl({ text: CAPTION, url: SHARE_URL });
    expect(out.startsWith('https://www.reddit.com/submit?')).toBe(true);
    const parsed = new URL(out);
    expect(parsed.searchParams.get('title')).toBe(CAPTION);
    expect(parsed.searchParams.get('url')).toBe(SHARE_URL);
  });
});

describe('app home fallbacks (honest degrade targets)', () => {
  it('points Instagram / TikTok at their real homes — no fake web intent', () => {
    expect(INSTAGRAM_HOME_URL).toBe('https://www.instagram.com/');
    expect(TIKTOK_HOME_URL).toBe('https://www.tiktok.com/');
  });
});
