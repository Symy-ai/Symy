/**
 * Component tests for ShareModal (勋章分享弹窗)
 *
 * 测试矩阵:
 *   - open=true: 渲染弹窗 (卡片 + 分享/保存按钮), 预生成 PNG (toPng 被调用)
 *   - open=false: 不渲染
 *   - X / backdrop 点击 → onClose
 *   - toPng 失败 → 错误文案 + 重试按钮, 分享按钮 disabled
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ShareModal } from '../share-modal';
import type { InterceptMedalData } from '@/types/intercept-medal';

// Mock html-to-image CDN loader — 不发真实网络请求
// vi.hoisted: vi.mock 工厂被提升到 const 声明之前执行, 引用必须在提升区创建
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

// Mock i18n
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'share.interceptMedal.modalTitle': 'Your intercept medal',
        'share.interceptMedal.share': 'Share',
        'share.interceptMedal.save': 'Save image',
        'share.interceptMedal.generating': 'Creating your medal…',
        'share.interceptMedal.generateFailed': "Couldn't create the image. Check your connection and retry.",
        'share.interceptMedal.retry': 'Retry',
        'common.close': 'Close',
      };
      let result = translations[key] ?? params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(0)}`,
}));

const medal: InterceptMedalData = {
  itemTitle: 'Air Fryer',
  savedCents: 8900,
  date: '2026-09-05T10:00:00Z',
};

describe('ShareModal', () => {
  beforeEach(() => {
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
  });

  it('renders card + actions when open, and pre-generates PNG', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    expect(screen.getByTestId('share-modal')).toBeTruthy();
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(screen.getByText('Your intercept medal')).toBeTruthy();
    expect(screen.getByText('Save image')).toBeTruthy();

    // 预生成完成后 (async), 分享按钮从 "Creating your medal…" 变为 "Share"
    await waitFor(() => expect(screen.getByText('Share')).toBeTruthy());
    expect(toPngMock).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ShareModal open={false} onClose={vi.fn()} medal={medal} />);
    expect(container.querySelector('[data-testid="share-modal"]')).toBeNull();
  });

  it('calls onClose via close button and backdrop', async () => {
    const onClose = vi.fn();
    render(<ShareModal open onClose={onClose} medal={medal} />);
    // 等生成完成 — 避免 "Creating your medal…" 状态下的渲染差异
    await waitFor(() => expect(screen.getByText('Share')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // portal 渲染在 document.body — backdrop 是 share-modal 的父元素
    fireEvent.click(screen.getByTestId('share-modal').parentElement as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes via Escape key', () => {
    const onClose = vi.fn();
    render(<ShareModal open onClose={onClose} medal={medal} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error + retry when PNG generation fails, share disabled', async () => {
    toPngMock.mockRejectedValue(new Error('CDN unavailable'));

    render(<ShareModal open onClose={vi.fn()} medal={medal} />);

    await waitFor(() => expect(screen.getByText(/Couldn't create the image/)).toBeTruthy());
    expect(screen.getByText('Retry')).toBeTruthy();

    const shareButton = screen.getByText('Share').closest('button') as HTMLButtonElement;
    expect(shareButton.disabled).toBe(true);
  });
});
