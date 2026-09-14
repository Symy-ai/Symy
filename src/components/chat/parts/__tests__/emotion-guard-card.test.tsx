// @vitest-environment happy-dom

/**
 * EmotionGuardCard 测试 — 三选项流程 + 三档语气 + 红线 (batch60-c)
 *
 * 覆盖: balanced 三选项; 花钱安慰 → 真诚祝福 + 可展开既有三问卡 + 零事件;
 * 免费安抚 → 按 mood 3 条建议 + 确认写一次 manual_adjustment (幂等);
 * 先等 10 分钟 → localStorage one-shot + 计时到期追问; 还想买=祝福零事件,
 * 放下了=写一次 wait_passed; 取消回选项; gentle 只共情不渲染选项;
 * strict 加 10 分钟建议; 卡面零金额零禁买措辞。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { EmotionGuardCard } from '../emotion-guard-card';
import {
  _resetEmotionGuardStoreForTest,
  getDueEmotionWait,
  getEmotionWait,
} from '../emotion-guard-store';
import type { EmotionGuardCardData } from '@/types/emotion-guard';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const dict: Record<string, string> = {
        'chat.emotionGuard.title': '情绪安抚',
        'chat.emotionGuard.empathy.tired': '累了一天了吧。',
        'chat.emotionGuard.empathy.sad': '难过的时候，先接住自己。',
        'chat.emotionGuard.care.sad.one': '翻翻收藏夹里的好东西',
        'chat.emotionGuard.gentleSpace': '想买点什么也没关系，本象不评判。',
        'chat.emotionGuard.optionSpend': '花钱买点安慰',
        'chat.emotionGuard.optionFreeCare': '试试免费安抚',
        'chat.emotionGuard.optionWait': '先等 10 分钟',
        'chat.emotionGuard.strictWaitNudge': '要不先给心情 10 分钟？',
        'chat.emotionGuard.spendBlessing': '好，去买吧——你值得被好好哄一哄。',
        'chat.emotionGuard.spendThreeQuestions': '展开买前三问',
        'chat.emotionGuard.freeCareTitle': '不花一分钱的安抚：',
        'chat.emotionGuard.care.tired.one': '倒杯温水慢慢喝',
        'chat.emotionGuard.care.tired.two': '散个步',
        'chat.emotionGuard.care.tired.three': '洗个热水澡',
        'chat.emotionGuard.freeCareConfirm': '好，就这么试试',
        'chat.emotionGuard.freeCareDone': '这通免费安抚本象记下啦。',
        'chat.emotionGuard.waitStarted': '好，本象 10 分钟后回来问你。',
        'chat.emotionGuard.waitCountdown': `还剩 ${vars?.time ?? ''}`,
        'chat.emotionGuard.waitCancel': '先不等了',
        'chat.emotionGuard.checkinQuestion': '10 分钟到了——现在还想买吗？',
        'chat.emotionGuard.checkinStillWant': '还想买',
        'chat.emotionGuard.checkinLetGo': '放下了',
        'chat.emotionGuard.checkinBlessing': '那就去吧，好好享受。',
        'chat.emotionGuard.checkinSuccessNote': '这记「放下」本象帮你收好啦。',
      };
      return dict[key] ?? key;
    },
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// 买前三问卡依赖 use-guard-intensity (localStorage) — mock 掉保持单测聚焦
vi.mock('@/hooks/use-guard-intensity', () => ({
  getGuardIntensity: () => 'balanced',
}));

const tiredCard: EmotionGuardCardData = { mood: 'tired', intensity: 'balanced' };

describe('EmotionGuardCard — 三选项 (balanced)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    vi.useFakeTimers();
    _resetEmotionGuardStoreForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    _resetEmotionGuardStoreForTest();
  });

  it('渲染共情 + 三个选项, 零金额', () => {
    render(<EmotionGuardCard data={tiredCard} />);
    expect(screen.getByTestId('emotion-guard-empathy').textContent).toContain('累了一天');
    expect(screen.getByTestId('emotion-guard-spend').textContent).toContain('花钱买点安慰');
    expect(screen.getByTestId('emotion-guard-care').textContent).toContain('免费安抚');
    expect(screen.getByTestId('emotion-guard-wait').textContent).toContain('先等 10 分钟');
    // 红线: 卡面零金额
    expect(screen.getByTestId('emotion-guard-card').textContent).not.toMatch(/\$|￥|元/);
  });

  it('花钱安慰 → 真诚祝福, 零事件写入; 可展开既有三问卡', () => {
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-spend'));
    expect(screen.getByTestId('emotion-guard-blessing').textContent).toContain('值得被好好哄一哄');
    expect(apiFetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('emotion-guard-three-questions'));
    expect(screen.getByTestId('prepurchase-card')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled(); // 展开三问本身也不写事件
  });

  it('免费安抚 → 按 mood 给 3 条建议, 确认写一次 free_care 审计 (幂等)', () => {
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-care'));
    expect(screen.getByTestId('emotion-guard-care-item-one').textContent).toContain('温水');

    fireEvent.click(screen.getByTestId('emotion-guard-confirm-care'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.eventType).toBe('manual_adjustment');
    expect(body.metadata).toEqual({ source: 'emotion_guard', mood: 'tired', choice: 'free_care' });
    expect(screen.getByTestId('emotion-guard-care-done')).toBeTruthy();
    // 确认按钮消失, 防连点重复写
    expect(screen.queryByTestId('emotion-guard-confirm-care')).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('先等 10 分钟 → localStorage one-shot; 到期追问; 还想买=祝福零事件', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-wait'));

    const wait = getEmotionWait();
    expect(wait?.mood).toBe('tired');
    expect(wait!.dueAt).toBe(start + 10 * 60 * 1000);
    expect(screen.getByTestId('emotion-guard-countdown').textContent).toContain('还剩');

    vi.setSystemTime(start + 10 * 60 * 1000 + 500);
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByTestId('emotion-guard-checkin').textContent).toContain('还想买吗');

    fireEvent.click(screen.getByTestId('emotion-guard-still-want'));
    expect(screen.getByTestId('emotion-guard-checkin-answered').textContent).toContain('好好享受');
    expect(apiFetchMock).not.toHaveBeenCalled(); // 花钱/仍想要分支零事件
    expect(getEmotionWait()).toBeNull();
  });

  it('到期追问「放下了」→ 写一次 wait_passed 审计', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-wait'));
    vi.setSystemTime(start + 10 * 60 * 1000 + 500);
    act(() => vi.advanceTimersByTime(1100));

    fireEvent.click(screen.getByTestId('emotion-guard-let-go'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.metadata).toEqual({ source: 'emotion_guard', mood: 'tired', choice: 'wait_passed' });
    expect(body.triggerId).toMatch(/^emotion-guard:\d{4}-\d{2}-\d{2}:tired$/);
    expect(getDueEmotionWait()).toBeNull();
  });

  it('等待中「先不等了」取消 → 记录消解, 回到选项, 零事件', () => {
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-wait'));
    expect(screen.getByTestId('emotion-guard-countdown')).toBeTruthy();

    fireEvent.click(screen.getByTestId('emotion-guard-cancel'));
    expect(getEmotionWait()).toBeNull();
    expect(screen.getByTestId('emotion-guard-spend')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('等待记录被外部消解 (刷新后追问条接棒) → 计时器回到选项, 不追问', () => {
    render(<EmotionGuardCard data={tiredCard} />);
    fireEvent.click(screen.getByTestId('emotion-guard-wait'));

    act(() => {
      _resetEmotionGuardStoreForTest(); // 模拟外部消解
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('emotion-guard-spend')).toBeTruthy();
    expect(screen.queryByTestId('emotion-guard-checkin')).toBeNull();
  });
});

describe('EmotionGuardCard — 三档语气 (红线)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    _resetEmotionGuardStoreForTest();
  });
  afterEach(() => {
    cleanup();
    _resetEmotionGuardStoreForTest();
  });

  it('gentle 只共情给空间 — 不渲染任何选项按钮', () => {
    render(<EmotionGuardCard data={{ mood: 'tired', intensity: 'gentle' }} />);
    expect(screen.getByTestId('emotion-guard-gentle-space')).toBeTruthy();
    expect(screen.queryByTestId('emotion-guard-spend')).toBeNull();
    expect(screen.queryByTestId('emotion-guard-care')).toBeNull();
    expect(screen.queryByTestId('emotion-guard-wait')).toBeNull();
  });

  it('strict 加 10 分钟建议, 但绝不禁止购买 (三选项仍在)', () => {
    render(<EmotionGuardCard data={{ mood: 'tired', intensity: 'strict' }} />);
    expect(screen.getByTestId('emotion-guard-strict-nudge').textContent).toContain('10 分钟');
    expect(screen.getByTestId('emotion-guard-spend')).toBeTruthy();
    // 红线: 全卡无禁买/羞辱措辞
    expect(screen.getByTestId('emotion-guard-card').textContent).not.toMatch(/别买|不能买|不许买|不该买/);
  });

  it('sad mood 的共情与安抚建议按 mood 取词', () => {
    render(<EmotionGuardCard data={{ mood: 'sad', intensity: 'balanced' }} />);
    expect(screen.getByTestId('emotion-guard-empathy').textContent).toContain('难过');
    fireEvent.click(screen.getByTestId('emotion-guard-care'));
    expect(screen.getByTestId('emotion-guard-care-item-one').textContent).toContain('收藏夹');
  });
});
