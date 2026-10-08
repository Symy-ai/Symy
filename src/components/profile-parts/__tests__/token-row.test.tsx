// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      const map: Record<string, string> = {
        'buddy.tokens': '代币',
        'buddy.tokenDetail': '代币详情',
        'buddy.virtualCurrency': '虚拟货币 / Virtual currency',
        'buddy.tokenDetailTitle': '代币说明',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts?.n !== undefined) v = v.replace('{n}', String(opts.n));
      return v;
    },
  }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/feature-flags', () => ({ GACHA_FEATURE_ENABLED: false }));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { TokenRow } from '../token-row';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

/**
 * token-row.tsx (128行) — 代币行 (owner 09-06 布局指令, home-tab 顺序首行)。
 *
 * 锁定:
 * - 自包含 fetch /api/buddy/state → tokens 数字
 * - 未加载/失败 → 破折号兜底 (装饰性行, 缺席可接受)
 * - ⓘ → 详情浮层 (Portal 底部抽屉) + 关闭双路 (遮罩/X)
 * - GACHA_FEATURE_ENABLED=false → 抽卡条目不渲染
 */
describe('TokenRow 代币行', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fetch 成功 → tokens 数字展示', async () => {
    mockApi.mockResolvedValueOnce({ buddyState: { tokens: 42 } } as never);
    render(<TokenRow />);
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(mockApi).toHaveBeenCalledWith('/api/buddy/state');
  });

  it('未加载/失败 → 破折号兜底 + warn 日志不炸', async () => {
    mockApi.mockRejectedValueOnce(new Error('down') as never);
    render(<TokenRow />);
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('ⓘ → 详情浮层 (大数字 + 获取方式区块)', async () => {
    mockApi.mockResolvedValueOnce({ buddyState: { tokens: 7 } } as never);
    render(<TokenRow />);
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('代币详情'));
    expect(screen.getByText('代币说明')).toBeTruthy();
    expect(screen.getByText('How to earn')).toBeTruthy();
    expect(screen.getByText('+5~10')).toBeTruthy();
  });

  it('浮层关闭双路: X 按钮 + 遮罩点击', async () => {
    mockApi.mockResolvedValueOnce({ buddyState: { tokens: 1 } } as never);
    render(<TokenRow />);
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('代币详情'));
    // Portal 浮层根 = body 最后一个子节点 (fixed inset-0 遮罩, onClick 关闭)
    const portalRoot = document.body.lastElementChild as HTMLElement;
    expect(portalRoot.className).toContain('fixed');
    fireEvent.click(portalRoot);
    await waitFor(() => expect(screen.queryByText('代币说明')).toBeNull());
    // 再开, X 关
    fireEvent.click(screen.getByLabelText('代币详情'));
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(screen.queryByText('代币说明')).toBeNull();
  });

  it('GACHA flag=false → 抽卡获取条目不渲染 (owner 09-30 令)', async () => {
    mockApi.mockResolvedValueOnce({ buddyState: { tokens: 3 } } as never);
    render(<TokenRow />);
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('代币详情'));
    // gacha 条目文案 (defaultValue 'Gacha draw' 类) 不在
    expect(screen.queryByText(/gacha/i)).toBeNull();
  });
});
