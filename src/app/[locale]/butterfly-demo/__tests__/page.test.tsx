// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  gen: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/client-illustration-engine', () => ({
  generateIllustrationClient: M.gen,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));

import ButterflyDemoPage from '../page';

/**
 * butterfly-demo/page.tsx (396行) — 插图生成演示页 (无认证独立页)。
 *
 * 锁定:
 * - 预设场景点击 → generateIllustrationClient 透传 title/tone/size 768x1344
 * - 成功 → imageUrl 优先/base64 兜底 data URL → 图片入列表
 * - 失败 → error 显示
 * - 自定义生成 → customPrompt 透传 + customTitle 缺省 key
 */
describe('ButterflyDemoPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('预设场景点击 → 引擎透传 (tone+size 锚)', async () => {
    M.gen.mockResolvedValueOnce({ success: true, imageUrl: 'https://cdn/x.png', prompt: 'p', imageBase64: '' });
    render(<ButterflyDemoPage />);
    const presetBtns = await waitFor(() => screen.getAllByRole('button').filter((b) => /presetSceneTitles/.test(b.textContent ?? '') || /🌱|🌑|🎰|⚖️/.test(b.textContent ?? '')));
    fireEvent.click(presetBtns[0]);
    await waitFor(() => expect(M.gen).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'hopeful',
      timeSpan: '1 day later',
      decisionType: 'bought',
      size: '768x1344',
    })));
  });

  it('成功 (纯 base64) → data URL 兜底+图入列表', async () => {
    M.gen.mockResolvedValueOnce({ success: true, imageUrl: '', imageBase64: 'ABC123', prompt: 'p' });
    render(<ButterflyDemoPage />);
    const presetBtns = await waitFor(() => screen.getAllByRole('button').filter((b) => /presetSceneTitles/.test(b.textContent ?? '') || /🌱|🌑|🎰|⚖️/.test(b.textContent ?? '')));
    fireEvent.click(presetBtns[0]);
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
      expect((img as HTMLImageElement).src).toContain('data:image/png;base64,ABC123');
    });
  });

  it('失败 → error 文案显示', async () => {
    M.gen.mockResolvedValueOnce({ success: false, error: 'Engine down' });
    render(<ButterflyDemoPage />);
    const presetBtns = await waitFor(() => screen.getAllByRole('button').filter((b) => /presetSceneTitles/.test(b.textContent ?? '') || /🌱|🌑|🎰|⚖️/.test(b.textContent ?? '')));
    fireEvent.click(presetBtns[0]);
    await waitFor(() => expect(screen.getByText(/Engine down/i)).toBeTruthy());
  });

  it('异常抛错 → Network error 兜底', async () => {
    M.gen.mockRejectedValueOnce(new Error('fetch failed'));
    render(<ButterflyDemoPage />);
    const presetBtns = await waitFor(() => screen.getAllByRole('button').filter((b) => /presetSceneTitles/.test(b.textContent ?? '') || /🌱|🌑|🎰|⚖️/.test(b.textContent ?? '')));
    fireEvent.click(presetBtns[0]);
    await waitFor(() => expect(screen.getByText(/fetch failed/i)).toBeTruthy());
  });

  it('自定义生成 → customPrompt 透传', async () => {
    M.gen.mockResolvedValueOnce({ success: true, imageUrl: 'https://cdn/y.png', prompt: 'p', imageBase64: '' });
    render(<ButterflyDemoPage />);
    // 四个基调按钮选 dark
    fireEvent.click(screen.getByRole('button', { name: '🌑' }));
    fireEvent.change(screen.getByPlaceholderText('butterflyDemo.titlePlaceholder'), { target: { value: '我的标题' } });
    fireEvent.change(screen.getByPlaceholderText('butterflyDemo.customPromptPlaceholder'), { target: { value: '自定义提示词' } });
    const genBtn = screen.getAllByRole('button').find((b) => /customGenerate|generate/i.test(b.textContent ?? ''));
    fireEvent.click(genBtn as HTMLButtonElement);
    await waitFor(() => expect(M.gen).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'dark',
      customPrompt: '自定义提示词',
      title: '我的标题',
    })));
  });
});
