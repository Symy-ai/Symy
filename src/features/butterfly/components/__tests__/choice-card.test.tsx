// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => ({
      'butterfly.crossroadsPrompt': '命运的岔路口',
      'butterfly.fateSealed': '命运已定',
      'butterfly.chooseWisely': '慎重选择 — 两个未来都在等你',
      'butterfly.tapToSeeChoices': '点开查看选择',
      'butterfly.expandChoices': '展开',
      'butterfly.collapseChoices': '收起',
    })[key] ?? opts?.defaultValue ?? key,
  }),
}));

import { ChoiceCard } from '../choice-card';

const OPTIONS = [
  { id: 'A', label: '熟悉的小路', hint: '熟悉里也藏着小惊喜' },
  { id: 'B', label: '陌生的小路', hint: '新地方可能有温柔的事' },
];

function renderCard(overrides: Record<string, unknown> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <ChoiceCard prompt="走哪条路？" options={OPTIONS} onSelect={onSelect} {...overrides} />,
  );
  return { ...utils, onSelect };
}

describe('ChoiceCard (303行 3D 翻转选择卡)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('初始: 岔路口提示 + prompt + 两选项 (label/hint) + 底部提示', () => {
    const { unmount } = renderCard();
    expect(screen.getByText('命运的岔路口')).toBeTruthy();
    expect(screen.getByText('走哪条路？')).toBeTruthy();
    expect(screen.getAllByText('熟悉的小路').length).toBeGreaterThanOrEqual(1); // 正面+高度占位双渲染
    expect(screen.getAllByText('陌生的小路').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/熟悉里也藏着小惊喜/).length).toBeGreaterThanOrEqual(1); // hint 同样双渲染
    expect(screen.getByText('慎重选择 — 两个未来都在等你')).toBeTruthy();
    unmount();
  });

  it('选择 A: 立即禁用全部选项, 850ms 翻转动画后才回调 (Round 96)', () => {
    vi.useFakeTimers();
    try {
      const { unmount, onSelect } = renderCard();
      const btnA = screen.getAllByText('熟悉的小路')[0].closest('button')!;
      fireEvent.click(btnA);
      expect(onSelect).not.toHaveBeenCalled(); // 动画期未回调
      // 命运已定反面已渲染 (翻转中)
      expect(screen.getAllByText('命运已定').length).toBeGreaterThanOrEqual(1); // 两卡反面都渲染
      act(() => vi.advanceTimersByTime(900));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('A');
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('已选择后: 再点 B 无效 (单选锁)', () => {
    vi.useFakeTimers();
    try {
      const { unmount, onSelect } = renderCard();
      const btnA = screen.getAllByText('熟悉的小路')[0].closest('button')!;
      fireEvent.click(btnA);
      act(() => vi.advanceTimersByTime(900));
      fireEvent.click(screen.getAllByText('陌生的小路')[0].closest('button')!);
      expect(onSelect).toHaveBeenCalledTimes(1); // 只有 A
      expect(onSelect).toHaveBeenLastCalledWith('A');
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('isDisabled: 点击无效', () => {
    const { unmount, onSelect } = renderCard({ isDisabled: true });
    fireEvent.click(screen.getAllByText('熟悉的小路')[0].closest('button')!);
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it('收起/展开: 🎰 按钮切换 (收起时 prompt/选项隐藏)', () => {
    const { unmount } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.getByText('点开查看选择')).toBeTruthy();
    expect(screen.queryByText('走哪条路？')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(screen.getByText('走哪条路？')).toBeTruthy();
    unmount();
  });

  it('选择后其他选项视觉弱化 (opacity 0.4 + scale 0.94)', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderCard();
      const btnA = screen.getAllByText('熟悉的小路')[0].closest('button')!;
      fireEvent.click(btnA);
      const bBtn = screen.getAllByText('陌生的小路')[0].closest('button') as HTMLElement;
      expect(bBtn.style.opacity).toBe('0.4');
      expect(bBtn.style.transform).toContain('scale(0.94)');
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('未选择时 hover: scale(1.01) + translateZ', () => {
    const { unmount } = renderCard();
    const aBtn = screen.getAllByText('熟悉的小路')[0].closest('button') as HTMLElement;
    fireEvent.mouseEnter(aBtn);
    expect(aBtn.style.transform).toContain('scale(1.01)');
    expect(aBtn.style.transform).toContain('translateZ(10px)');
    fireEvent.mouseLeave(aBtn);
    expect(aBtn.style.transform).toBe('scale(1)');
    unmount();
  });

  it('触觉反馈: navigator.vibrate 被调 (Round 96 移动端)', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    vi.useFakeTimers();
    try {
      const { unmount } = renderCard();
      const btnA = screen.getAllByText('熟悉的小路')[0].closest('button')!;
      fireEvent.click(btnA);
      expect(vibrate).toHaveBeenCalledWith([20, 30, 40]);
      unmount();
    } finally {
      vi.useRealTimers();
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it('卸载清理: 850ms 定时器内 unmount 不崩', () => {
    vi.useFakeTimers();
    try {
      const { unmount, onSelect } = renderCard();
      const btnA = screen.getAllByText('熟悉的小路')[0].closest('button')!;
      fireEvent.click(btnA);
      unmount(); // 动画期卸载
      act(() => vi.advanceTimersByTime(900));
      expect(onSelect).not.toHaveBeenCalled(); // timer 被清
    } finally { vi.useRealTimers(); }
  });
});
