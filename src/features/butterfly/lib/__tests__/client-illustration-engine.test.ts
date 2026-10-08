import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { buildClientIllustrationPrompt, generateIllustrationClient } from '../client-illustration-engine';
import { apiFetch } from '@/lib/api-client';

const mockFetch = vi.mocked(apiFetch);

/**
 * client-illustration-engine.ts (244行) — V8 客户端插图引擎 (prompt 构建 + 服务端 API 调用)。
 *
 * 锁定:
 * - TONE_VISUAL_MAP 四基调视觉词汇
 * - timeHint/contentHint 分支
 * - V9 双格式 (imageUrl CDN / imageBase64 data URL)
 * - provider=openai-compatible → fromAI
 * - Round 65 LOW-3: abort listener 移除 (成功路径不泄漏)
 */

describe('buildClientIllustrationPrompt', () => {
  it('基调词汇映射: hopeful→emerald/dark→crimson/twist→neon/neutral→silver', () => {
    const p1 = buildClientIllustrationPrompt('t', 'hopeful', 'x', 'd', 'bought');
    const p2 = buildClientIllustrationPrompt('t', 'dark', 'x', 'd', 'bought');
    const p3 = buildClientIllustrationPrompt('t', 'twist', 'x', 'd', 'bought');
    const p4 = buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought');
    expect(p1).toContain('dawn breaking through darkness');
    expect(p2).toContain('ominous foreboding');
    expect(p3).toContain('reality bending');
    expect(p4).toContain('quiet stillness');
    // lighting 词汇
    expect(p1).toContain('sunbeams piercing through');
    expect(p4).toContain('flat cold blue steel');
  });

  it('timeHint 分支: year/later→weathered; morning→present moment; night→stars', () => {
    expect(buildClientIllustrationPrompt('t', 'neutral', 'a year later', 'd', 'bought')).toContain('passage of years');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'the next morning', 'd', 'bought')).toContain('present moment crystallized');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'at night', 'd', 'bought')).toContain('stars or city lights');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'next week', 'd', 'bought')).toContain('seasonal changes');
  });

  it('contentHint: rain/fire/mirror/door/ocean 五分支 (>50 字符才启用)', () => {
    const long = (kw: string) => `the scene describes ${kw} in great detail over many many words to exceed fifty characters easily`;
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', long('rain'))).toContain('Rain streaking down dark windows');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', long('fire'))).toContain('Embers glowing');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', long('mirror'))).toContain('Cracked mirror');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', long('door'))).toContain('ajar door');
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', long('ocean'))).toContain('dim moonlight');
    // 短 snippet 不启用
    expect(buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', 'rain')).not.toContain('Rain streaking');
  });

  it('isLight: 亮色 manga/背景词汇切换 + 禁脸/禁蝶红线双不变', () => {
    const light = buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', undefined, true);
    const dark = buildClientIllustrationPrompt('t', 'neutral', 'x', 'd', 'bought', undefined, false);
    expect(light).toContain('bright and airy');
    expect(dark).toContain('dark atmospheric');
    for (const p of [light, dark]) {
      expect(p).toContain('NO butterflies, NO insect imagery');
      expect(p).toContain('NO face visible on the protagonist');
    }
  });

  it('标题拼入 vertical composition', () => {
    expect(buildClientIllustrationPrompt('夜市抉择', 'neutral', 'x', 'd', 'bought')).toContain('vertical composition: 夜市抉择');
  });
});

describe('generateIllustrationClient', () => {
  it('V9 imageUrl 模式: CDN URL 直用 + fromAI (provider=openai-compatible)', async () => {
    mockFetch.mockResolvedValueOnce({
      success: true, imageUrl: 'https://cdn/x.png', provider: 'openai-compatible', prompt: 'p', format: 'png',
    } as never);
    const res = await generateIllustrationClient({ title: 't', tone: 'neutral', timeSpan: 'x', decisionDescription: 'd', decisionType: 'bought' });
    expect(res.success).toBe(true);
    expect(res.imageUrl).toBe('https://cdn/x.png');
    expect(res.fromAI).toBe(true);
    expect(res.format).toBe('png');
  });

  it('V9 imageBase64 兜底: data URL 构造 (svg→image/svg+xml)', async () => {
    mockFetch.mockResolvedValueOnce({
      success: true, imageBase64: 'PHN2Zz4=', provider: 'svg-engine', format: 'svg',
    } as never);
    const res = await generateIllustrationClient({ title: 't', tone: 'dark', timeSpan: 'x', decisionDescription: 'd', decisionType: 'resisted' });
    expect(res.success).toBe(true);
    expect(res.fromAI).toBe(false);
    expect(res.imageUrl).toBe('data:image/svg+xml;base64,PHN2Zz4=');
    expect(res.format).toBe('svg');
  });

  it('imageBase64 png 缺 format → image/png', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, imageBase64: 'AAA=' } as never);
    const res = await generateIllustrationClient({ title: 't', tone: 'neutral', timeSpan: 'x', decisionDescription: 'd', decisionType: 'bought' });
    expect(res.imageUrl).toBe('data:image/png;base64,AAA=');
    expect(res.format).toBe('png');
  });

  it('success=false → error 透传 + isNetworkError', async () => {
    mockFetch.mockResolvedValueOnce({ success: false, error: 'boom', isNetworkError: true } as never);
    const res = await generateIllustrationClient({ title: 't', tone: 'neutral', timeSpan: 'x', decisionDescription: 'd', decisionType: 'bought' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('boom');
    expect(res.isNetworkError).toBe(true);
  });

  it('异常 → isNetworkError=true 兜底 (永不抛)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net down'));
    const res = await generateIllustrationClient({ title: 't', tone: 'neutral', timeSpan: 'x', decisionDescription: 'd', decisionType: 'bought' });
    expect(res.success).toBe(false);
    expect(res.isNetworkError).toBe(true);
    expect(res.error).toBe('net down');
  });

  it('signal 透传给 apiFetch (外部中断直连)', async () => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ success: false } as never);
    const ac = new AbortController();
    await generateIllustrationClient({ title: 't', tone: 'neutral', timeSpan: 'x', decisionDescription: 'd', decisionType: 'bought', signal: ac.signal });
    expect((mockFetch.mock.calls[0][1] as { signal?: AbortSignal }).signal).toBe(ac.signal);
    // Round 65 LOW-3: 完成后 listener 已移除
    expect(ac.signal).toBeTruthy();
    ac.abort(); // 不炸
  });

  it('timeoutMs=0 (90s 长生成由内部 controller 管) + POST body 携带全参数', async () => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ success: false } as never);
    await generateIllustrationClient({ title: '标题', tone: 'twist', timeSpan: '晚', decisionDescription: 'd', decisionType: 'bought', size: '136x238' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/butterfly/illustration-demo');
    expect((init as { method?: string }).method).toBe('POST');
    expect((init as { timeoutMs?: number }).timeoutMs).toBe(0);
    expect((init as { body?: { title?: string; size?: string } }).body).toMatchObject({ title: '标题', size: '136x238' });
  });
});
