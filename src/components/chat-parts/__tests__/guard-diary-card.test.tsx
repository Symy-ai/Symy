// @vitest-environment happy-dom

/* eslint-disable require-await -- mock 的 toPng 返回常量 promise, 无需 await 表达式 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuardDiary } from '@/lib/guard-diary';
import { _resetGuardDiaryStoreForTest } from '@/lib/guard-diary-store';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      const dict: Record<string, string> = {
        'chat.guardDiary.estSavedLabel': '今日省下估算',
        'chat.guardDiary.recentTitle': '最近的日记',
        'chat.guardDiary.shareDownload': '保存图片',
        'chat.guardDiary.sharePill': '守护日记',
        'chat.guardDiary.shareGenerating': '生成中…',
        'chat.guardDiary.shareFailed': '生成失败，请重试',
        'chat.guardDiary.shareClose': '关闭',
      };
      return dict[key] ?? opts?.defaultValue ?? key;
    },
    locale: 'zh',
  }),
}));

// batch73-a: toPng 可控行为 — 默认成功; failFirst 置 true 时失败一次 (测重试链路)
const toPngState = vi.hoisted(() => ({ failFirst: false, calls: 0 }));

vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: async () => ({
    toPng: async () => {
      toPngState.calls += 1;
      if (toPngState.failFirst) {
        toPngState.failFirst = false;
        throw new Error('canvas export failed');
      }
      return 'data:image/png;base64,FAKE';
    },
  }),
}));

const mockDiary: GuardDiary = {
  date: '2026-09-08',
  text: '今天替你守住了 2 次冲动，赢回 4 小时属于你的时间 🐘',
  variant: 'standard',
  guardCount: 2,
  hoursReclaimed: 4,
  estSaved: 100,
  nightGuardCount: 0,
  topCategory: undefined,
};

let mockHookResult: GuardDiary | null = mockDiary;
vi.mock('@/hooks/use-guard-diary', () => ({
  useGuardDiary: () => ({ diary: mockHookResult }),
}));

import { GuardDiaryCard } from '../guard-diary-card';

describe('GuardDiaryCard', () => {
  beforeEach(() => {
    mockHookResult = mockDiary;
  });
  afterEach(() => {
    cleanup();
    _resetGuardDiaryStoreForTest();
    window.localStorage.clear();
    toPngState.failFirst = false;
  });

  it('渲染日记一句 + 次数; 无 hook 数据 → 不渲染', () => {
    render(<GuardDiaryCard streakDays={3} />);
    expect(screen.getByTestId('guard-diary-card').textContent).toContain(mockDiary.text);
    expect(screen.queryByTestId('guard-diary-private')).toBeNull();

    cleanup();
    mockHookResult = null;
    render(<GuardDiaryCard streakDays={3} />);
    expect(screen.queryByTestId('guard-diary-card')).toBeNull();
    mockHookResult = mockDiary;
  });

  it('展开私有面: 显示今日省下估算金额; 收藏后星标高亮且出现在回看列表', () => {
    render(<GuardDiaryCard streakDays={0} />);
    fireEvent.click(screen.getByTestId('guard-diary-expand'));

    const priv = screen.getByTestId('guard-diary-private');
    expect(priv.textContent).toContain('今日省下估算');
    expect(priv.textContent).toContain('100'); // $100.00

    const star = screen.getByTestId('guard-diary-favorite');
    expect(star.dataset.favorited).toBe('false');
    fireEvent.click(star);
    expect(star.dataset.favorited).toBe('true');
    expect(screen.getByTestId('guard-diary-recent-list').textContent).toContain(mockDiary.text);
  });

  it('分享弹层: 分享面含日记与次数, 零金额 — estSaved 不得出现在分享 DOM', async () => {
    render(<GuardDiaryCard streakDays={5} />);
    fireEvent.click(screen.getByTestId('guard-diary-share-btn'));
    const modal = await screen.findByTestId('guard-diary-share-modal');
    expect(modal.textContent).toContain(mockDiary.text);
    expect(modal.textContent).toContain('5'); // streak days
    // 金额红线: estSaved=100 与货币符号不得出现在分享 DOM
    expect(modal.querySelector('[data-testid="guard-diary-est-saved"]')).toBeNull();
    expect(modal.textContent).not.toContain('今日省下估算');
    expect(modal.textContent).not.toMatch(/\$\s?100/);
  });

  it('零守护日 (companion): 私有面无金额, 陪伴文案不渲染失败态', () => {
    mockHookResult = { ...mockDiary, variant: 'companion', guardCount: 0, estSaved: 0, hoursReclaimed: 0, text: '今天没有诱惑来找你，小象陪你安静地过了一天 🐘' };
    render(<GuardDiaryCard streakDays={0} />);
    fireEvent.click(screen.getByTestId('guard-diary-expand'));
    const priv = screen.getByTestId('guard-diary-private');
    expect(priv.textContent).not.toContain('今日省下估算');
    expect(priv.textContent).not.toMatch(/[$¥€]/);
    mockHookResult = mockDiary;
  });

  // 🔧 batch73-a 回归: 保存按钮在弹层打开后必须变为可点 (旧实现点击 handler 里同步生成,
  //    弹层未挂载 ref 为 null, shareState 恒 'idle', 按钮永久禁用 — 聊天页无法保存分享图)
  it('保存按钮: 预生成完成后可点, 点击触发下载流程', async () => {
    render(<GuardDiaryCard streakDays={5} />);
    fireEvent.click(screen.getByTestId('guard-diary-share-btn'));
    const btn = (await screen.findByTestId('guard-diary-share-download')) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    expect(btn.textContent).toContain('保存图片');

    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(btn);
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    anchorClick.mockRestore();
  });

  it('生成失败: 保存按钮变可点重试入口, 点击重新生成', async () => {
    toPngState.failFirst = true;
    toPngState.calls = 0;
    render(<GuardDiaryCard streakDays={5} />);
    fireEvent.click(screen.getByTestId('guard-diary-share-btn'));
    const btn = (await screen.findByTestId('guard-diary-share-download')) as HTMLButtonElement;
    // 失败态: 文案为「生成失败，请重试」且按钮必须可点 (旧实现禁用, 文案承诺的重试无处可点)
    await waitFor(() => expect(btn.disabled).toBe(false));
    expect(btn.textContent).toContain('生成失败');
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toContain('保存图片'));
    expect(toPngState.calls).toBe(2);
  });
});
