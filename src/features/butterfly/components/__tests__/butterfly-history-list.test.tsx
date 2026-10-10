// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ButterflyHistoryList } from '../butterfly-history-list';
import type { UseButterflyHistoryReturn } from '../../hooks/use-butterfly-history';
import type { ButterflySession } from '../../types';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => ({
      'butterfly.historyEmpty': '还没有宇宙。开启你的第一个。',
      'butterfly.historyLoadError': '加载失败。请重试',
      'butterfly.historyStartNew': '看一个新宇宙',
      'butterfly.historyNoResults': '没有匹配的故事',
      'butterfly.historyLoadMore': '加载更多',
    })[key] ?? opts?.defaultValue ?? key,
  }),
}));

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 's-1',
    userId: 'u-1',
    decisionType: 'bought' as never,
    decisionDescription: 'Coffee machine',
    amount: 10,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    isExample: false,
    isBookmarked: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function history(overrides: Partial<UseButterflyHistoryReturn> = {}): UseButterflyHistoryReturn {
  return {
    sessions: [],
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    error: null,
    deletingId: null,
    hasMore: false,
    total: 0,
    selectSession: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(true),
    deleteAllIncomplete: vi.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
    refresh: vi.fn(),
    loadMore: vi.fn(),
    ...overrides,
  } as unknown as UseButterflyHistoryReturn;
}

describe('ButterflyHistoryList', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('renders the empty state when there is no history', () => {
    render(<ButterflyHistoryList history={history()} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByText(/还没有宇宙/)).toBeTruthy();
  });

  it('renders session cards for loaded sessions', () => {
    const h = history({ sessions: [session({ decisionDescription: 'Coffee machine', status: 'completed' })], total: 1 });
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByText(/Coffee machine/)).toBeTruthy();
  });

  it('shows the load-more control only when hasMore', () => {
    const h = history({ sessions: [session()], hasMore: true, total: 11 });
    const { rerender } = render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByText('加载更多')).toBeTruthy();
    const h2 = history({ sessions: [session()], hasMore: false, total: 1 });
    rerender(<ButterflyHistoryList history={h2} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.queryByText('加载更多')).toBeNull();
  });

  it('calls loadMore when clicking the load-more control', () => {
    const loadMore = vi.fn();
    const h = history({ sessions: [session()], hasMore: true, total: 11, loadMore });
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    fireEvent.click(screen.getByText('加载更多'));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the error banner when history load failed', () => {
    const h = history({ error: 'boom' } as Partial<UseButterflyHistoryReturn>);
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByText(/加载失败/)).toBeTruthy();
  });

  it('N37: 搜索覆盖多字段 — platform/chapter 标题命中, 无结果区分文案', () => {
    const s1 = session({
      id: 's-1',
      decisionDescription: 'Coffee machine',
      platform: 'taobao',
      chapters: [{ id: 'c1', title: '第一章：清晨的咖啡香', content: '...', choices: [] } as never],
      status: 'completed',
    });
    const s2 = session({ id: 's-2', decisionDescription: 'Headphones', status: 'completed' });
    const h = history({ sessions: [s1, s2], total: 2 });
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);

    // 平台命中
    const search = screen.getByPlaceholderText('butterfly.historySearchPlaceholder');
    fireEvent.change(search, { target: { value: 'taobao' } });
    expect(screen.getByText(/Coffee machine/)).toBeTruthy();
    expect(screen.queryByText(/Headphones/)).toBeNull();

    // 章节标题命中 (N37)
    fireEvent.change(search, { target: { value: '咖啡香' } });
    expect(screen.getByText(/Coffee machine/)).toBeTruthy();

    // 无结果文案 (区别于空历史)
    fireEvent.change(search, { target: { value: 'zzz-none' } });
    expect(screen.getByText('没有匹配的故事')).toBeTruthy();
  });

  it('task4: bookmarked 过滤只显收藏故事 + 计数徽章', () => {
    const s1 = session({ id: 's-1', decisionDescription: 'Bookmarked one', isBookmarked: true, status: 'completed' });
    const s2 = session({ id: 's-2', decisionDescription: 'Plain one', status: 'completed' });
    const h = history({ sessions: [s1, s2], total: 2 });
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);

    fireEvent.click(screen.getByText('Bookmarked'));
    expect(screen.getByText(/Bookmarked one/)).toBeTruthy();
    expect(screen.queryByText(/Plain one/)).toBeNull();
  });

  it('NEW-Y: 删除走两步确认 — 点删除钮先弹确认层, 确认才调 deleteSession', async () => {
    const deleteSession = vi.fn().mockResolvedValue(true);
    const s1 = session({ id: 's-del', decisionDescription: 'To be deleted', status: 'completed' });
    const h = history({ sessions: [s1], total: 1, deleteSession });
    render(<ButterflyHistoryList history={h} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />);

    // 行内删除按钮 (aria-label 锚)
    fireEvent.click(screen.getByLabelText('delete'));
    // 确认弹层出现 → 点确认 (butterfly.deleteConfirm 锚) 才调 deleteSession
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith('s-del'));
  });
});
