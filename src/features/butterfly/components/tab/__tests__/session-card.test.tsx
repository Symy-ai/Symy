// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetchMock(...(a as [])),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      if (key === 'butterfly.historyChapterCount') return `${opts?.n} 章`;
      if (key === 'butterfly.readTime') return `${opts?.n} 分钟`;
      if (key === 'butterfly.historyChoicesCount') return `${opts?.n} 次选择`;
      const map: Record<string, string> = {
        'butterfly.bought': '已购买',
        'butterfly.resisted': '已抵抗',
        'butterfly.considering': '考虑中',
        'butterfly.historyCompleted': '已完成',
        'butterfly.historyAbandoned': '未完成',
        'butterfly.historyNoChoiceYet': 'No choice made',
        'butterfly.bookmark': '收藏',
        'butterfly.removeBookmark': '取消收藏',
        'common.delete': 'delete',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('@/lib/utils', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/utils')>();
  return { ...real, formatDate: () => '2026-10-09' };
});

import { SessionCard } from '../session-card';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1', user_id: 'u-1', status: 'completed', currentChapter: 3,
    decisionType: 'bought', decisionDescription: '一台咖啡机', amount: 159,
    platform: null, context: null, createdAt: '2026-10-09T00:00:00Z',
    isBookmarked: false, finalTone: 'twist', butterflyEffect: '一个决定,两种人生。',
    outline: { version: 1, chapters: [{}, {}, {}], endingHint: '' },
    chapters: [
      { index: 1, title: 'a', content: 'x'.repeat(250), tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '' },
      { index: 2, title: 'b', content: 'y'.repeat(250), tone: 'twist', timeSpan: 'now', hasChoice: true, createdAt: '' },
      { index: 3, title: 'c', content: 'z'.repeat(250), tone: 'twist', timeSpan: 'now', hasChoice: false, createdAt: '' },
    ],
    choices: [
      { id: 'c1', chapterIndex: 2, prompt: 'p', options: [], selectedOption: 'A', createdAt: '', outlineRegenerated: false },
      { id: 'c2', chapterIndex: 2, prompt: 'p', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false },
    ],
    ...overrides,
  } as never;
}

function renderCard(overrides: Record<string, unknown> = {}, sessionOverrides: Record<string, unknown> = {}) {
  const onClick = vi.fn();
  const onDelete = vi.fn();
  const onBookmarkToggle = vi.fn();
  const utils = render(
    <SessionCard
      session={session(sessionOverrides)}
      isLight={false}
      locale="zh"
      onClick={onClick}
      onDelete={onDelete}
      isDeleting={false}
      onBookmarkToggle={onBookmarkToggle}
      {...(overrides as unknown as Record<string, never>)}
    />,
  );
  return { ...utils, onClick, onDelete, onBookmarkToggle };
}

describe('SessionCard (291行 历史会话卡)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('已完成卡: bought 徽章 + 已完成 + 3/3 进度 + 蝴蝶效应摘要 + 阅读时长', () => {
    const { unmount } = renderCard();
    expect(screen.getByText('已购买')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(screen.getByText('一个决定,两种人生。')).toBeTruthy(); // butterflyEffect <90 不截断
    expect(screen.getByText('3 分钟')).toBeTruthy(); // 750字/250 = 3min
    expect(screen.getByText('3 章')).toBeTruthy();
    expect(screen.getByText('1 次选择')).toBeTruthy(); // 只有 selectedOption 非 null 的
    unmount();
  });

  it('resisted/considering 徽章三态', () => {
    const a = renderCard({}, { decisionType: 'resisted' });
    expect(a.getByText('已抵抗')).toBeTruthy();
    a.unmount();
    const b = renderCard({}, { decisionType: 'considering' });
    expect(b.getByText('考虑中')).toBeTruthy();
    b.unmount();
  });

  it('未完成: 未完成徽章 + 无蝴蝶效应行 + 无阅读时长', () => {
    const { unmount } = renderCard({}, { status: 'active', butterflyEffect: null, finalTone: null });
    expect(screen.getByText('未完成')).toBeTruthy();
    expect(screen.queryByText('一个决定,两种人生。')).toBeNull();
    expect(screen.queryByText(/分钟/)).toBeNull();
    unmount();
  });

  it('amount/platform 元信息行', () => {
    const { unmount } = renderCard({}, { platform: 'taobao' });
    expect(screen.getByText('$159.00')).toBeTruthy();
    expect(screen.getByText('taobao')).toBeTruthy();
    unmount();
    const no = renderCard({}, { amount: null, platform: null });
    expect(no.queryByText(/\$\d/)).toBeNull();
    no.unmount();
  });

  it('long butterflyEffect 截断到 90 字符', () => {
    const long = '很长的效应'.repeat(30); // 150 字
    const { unmount } = renderCard({}, { butterflyEffect: long });
    expect(screen.getByText(`${long.slice(0, 90)}…`)).toBeTruthy();
    unmount();
  });

  it('卡片点击: onClick 触发', () => {
    const { unmount, onClick } = renderCard();
    fireEvent.click(screen.getByText('一台咖啡机'));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('收藏乐观更新: PATCH 成功回调 onBookmarkToggle', async () => {
    apiFetchMock.mockResolvedValue({ success: true, isBookmarked: true });
    const { unmount, onBookmarkToggle } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '收藏' }));
    await waitFor(() => expect(onBookmarkToggle).toHaveBeenCalledWith('s-1', true));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/butterfly/sessions/s-1', { method: 'PATCH' });
    // 星标态切换 → aria-label 变
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeTruthy();
    unmount();
  });

  it('收藏失败回滚: isBookmarked 恢复 false', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    const { unmount, onBookmarkToggle } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '收藏' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '收藏' })).toBeTruthy());
    expect(onBookmarkToggle).not.toHaveBeenCalled();
    unmount();
  });

  it('删除按钮: onDelete + stopPropagation 不触发 onClick', () => {
    const { unmount, onDelete } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('无选择且章数>=2: No choice made 提示', () => {
    const { unmount } = renderCard({}, {
      choices: [{ id: 'c1', chapterIndex: 2, prompt: 'p', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false }],
    });
    expect(screen.getByText('No choice made')).toBeTruthy();
    unmount();
  });
});
