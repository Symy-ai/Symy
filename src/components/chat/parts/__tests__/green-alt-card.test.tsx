/* eslint-disable require-await -- test mocks use async for API consistency */
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GreenAltCard } from '../green-alt-card';
// 用真实 use-green-pref (共享状态 + localStorage), 走开关静默路径
import { _resetGreenPrefStateForTest, setGreenPrefEnabled } from '@/hooks/use-green-pref';
import { _resetGreenAltAdoptionForTest } from '@/components/chat-parts/green-alt-adoption';
import type { GreenAltCardData } from '@/types/green-alt-card';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'chat.greenAlt.title': 'Greener choices',
        'chat.greenAlt.optionsTitle': 'Greener swaps',
        'chat.greenAlt.reuseTitle': 'Reuse first',
        'chat.greenAlt.honorNote': "You're doing the right thing 🌱",
        'chat.greenAlt.adoptButton': 'I chose the greener option',
        'chat.greenAlt.adoptedNote': 'Your green choice is recorded',
        'chat.greenAlt.challengeInvite': 'Up for a 24-hour micro challenge?',
        'chat.greenAlt.feedbackTitle': 'Not quite the right fit?',
        'chat.greenAlt.feedbackAck.already_have': "Noted — we'll check what you already have first next time",
        'chat.greenAlt.feedbackAck.not_now': "Got it — we'll leave it for now",
        'chat.greenAlt.feedbackAck.wrong_channel': "Noted — next time we'll suggest a different route",
        'chat.greenAlt.feedbackAck.prefer_buy': "Okay — this time it's your call",
      })[key] || key,
  }),
}));

const data: GreenAltCardData = {
  id: 'fur',
  why: 'Real fur carries a heavy load.',
  options: ['High-quality faux fur', 'Recycled-fiber insulated coats', 'Heavyweight fleece'],
  reuse: 'You may already have a heavy coat.',
  reuseChannel: 'Secondhand racks have plenty of warm options.',
};

describe('GreenAltCard', () => {
  afterEach(() => {
    cleanup();
    _resetGreenPrefStateForTest();
    _resetGreenAltAdoptionForTest();
    vi.doUnmock('@/components/chat-parts/green-alt-adoption');
  });

  it('渲染标题/为什么/替代选项/复用方案/荣誉收尾', () => {
    render(<GreenAltCard data={data} />);
    expect(screen.getByText('Greener choices')).toBeTruthy();
    expect(screen.getByText(data.why)).toBeTruthy();
    expect(screen.getByText(data.options[0])).toBeTruthy();
    expect(screen.getByText(data.options[1])).toBeTruthy();
    expect(screen.getByText(data.options[2])).toBeTruthy();
    expect(screen.getByText('Greener swaps')).toBeTruthy();
    expect(screen.getByText(data.reuse)).toBeTruthy();
    expect(screen.getByText(data.reuseChannel)).toBeTruthy();
    expect(screen.getByText('Reuse first')).toBeTruthy();
    expect(screen.getByText("You're doing the right thing 🌱")).toBeTruthy();
  });

  it('建议内容区无链接跳转 (采纳按钮除外)', () => {
    const { container } = render(<GreenAltCard data={data} />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('采纳按钮: 点击后进已确认态且不可重复上报', async () => {
    _resetGreenAltAdoptionForTest();
    const reportMock = vi.fn(async () => ({ status: 'reported' as const }));
    vi.doMock('@/components/chat-parts/green-alt-adoption', () => ({
      isGreenAltAdoptionReported: () => false,
      reportGreenAltAdoption: reportMock,
    }));
    // doMock 需要重新加载被测模块
    vi.resetModules();
    const { GreenAltCard: FreshCard } = await import('../green-alt-card');

    render(<FreshCard data={data} />);
    const button = screen.getByTestId('green-alt-adopt-button');
    expect(button.textContent).toBe('I chose the greener option');

    fireEvent.click(button);
    expect(await screen.findByTestId('green-alt-adopted-note')).toBeTruthy();
    expect(screen.queryByTestId('green-alt-adopt-button')).toBeNull();
    expect(screen.getByText('Your green choice is recorded')).toBeTruthy();
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('fur');

    // 已确认态无按钮可再点 — 同一卡片不可重复上报
    expect(document.querySelector('[data-testid="green-alt-adopt-button"]')).toBeNull();
    vi.doUnmock('@/components/chat-parts/green-alt-adoption');
  });

  // batch63-a: celebration 词条走同一张卡 — 渲染与采纳幂等规则不变
  it('celebration 词条渲染且采纳不可重复上报', async () => {
    _resetGreenAltAdoptionForTest();
    const reportMock = vi.fn(async () => ({ status: 'reported' as const }));
    vi.doMock('@/components/chat-parts/green-alt-adoption', () => ({
      isGreenAltAdoptionReported: () => false,
      reportGreenAltAdoption: reportMock,
    }));
    vi.resetModules();
    const { GreenAltCard: FreshCard } = await import('../green-alt-card');

    const celebrationData: GreenAltCardData = {
      id: 'wedding_decor_rental',
      why: 'Wedding decor is built for a single afternoon.',
      options: ['Rent the arch and backdrop per event', 'Potted centerpieces that guests take home'],
      reuse: 'Holiday light strands join your ceremony stash.',
      reuseChannel: 'Arches and light strands circulate on secondhand marketplaces.',
    };
    render(<FreshCard data={celebrationData} />);
    expect(screen.getByText(celebrationData.why)).toBeTruthy();
    expect(screen.getByText(celebrationData.options[0])).toBeTruthy();
    expect(screen.getByText(celebrationData.reuseChannel)).toBeTruthy();

    fireEvent.click(screen.getByTestId('green-alt-adopt-button'));
    expect(await screen.findByTestId('green-alt-adopted-note')).toBeTruthy();
    // 已确认态无按钮可再点 — same-entry 幂等, 只上报一次
    expect(document.querySelector('[data-testid="green-alt-adopt-button"]')).toBeNull();
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('wedding_decor_rental');
    vi.doUnmock('@/components/chat-parts/green-alt-adoption');
  });

  it('localStorage 已上报过的卡片初始即为已确认态', async () => {
    vi.doMock('@/components/chat-parts/green-alt-adoption', () => ({
      isGreenAltAdoptionReported: () => true,
      reportGreenAltAdoption: vi.fn(),
    }));
    vi.resetModules();
    const { GreenAltCard: FreshCard } = await import('../green-alt-card');

    render(<FreshCard data={data} />);
    expect(screen.queryByTestId('green-alt-adopt-button')).toBeNull();
    expect(screen.getByTestId('green-alt-adopted-note')).toBeTruthy();
    vi.doUnmock('@/components/chat-parts/green-alt-adoption');
  });

  it('绿色守护开启: 渲染卡片', () => {
    setGreenPrefEnabled(true);
    const { container } = render(<GreenAltCard data={data} />);
    expect(container.querySelector('[data-testid="green-alt-card"]')).not.toBeNull();
  });

  it('绿色守护关闭: 整体静默不渲染', () => {
    setGreenPrefEnabled(false);
    const { container } = render(<GreenAltCard data={data} />);
    expect(container.querySelector('[data-testid="green-alt-card"]')).toBeNull();
  });
});

// 🛡️ batch48-a: 守护强度三档尾句行为 (strict 挑战入口 / gentle 去追问 / balanced 现状)
import { setGuardIntensity, _resetGuardIntensityStateForTest } from '@/hooks/use-guard-intensity';
import { _resetMicroChallengeStoreForTest } from '../micro-challenge-store';
// 🐘 batch62-b: 拒绝反馈区
import {
  _resetGreenAltRejectionForTest,
  _seedGreenAltRejectionForTest,
} from '@/components/chat-parts/green-alt-rejection';

describe('GreenAltCard × guard intensity', () => {
  beforeEach(() => {
    setGreenPrefEnabled(true);
    _resetGuardIntensityStateForTest();
    _resetMicroChallengeStoreForTest();
    _resetGreenAltAdoptionForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
    _resetMicroChallengeStoreForTest();
  });

  it('balanced (默认): 无挑战入口, 采纳确认行保持现状 (AC2 回归)', () => {
    render(<GreenAltCard data={data} />);
    expect(screen.queryByTestId('green-alt-challenge-invite')).toBeNull();
    expect(screen.getByTestId('green-alt-adopt-button')).toBeTruthy();
  });

  it('strict: 尾部出现微挑战入口, 点击展开既有 24h 微挑战卡', () => {
    setGuardIntensity('strict');
    render(<GreenAltCard data={data} />);
    const invite = screen.getByTestId('green-alt-challenge-invite');
    expect(invite.textContent).toBe('Up for a 24-hour micro challenge?');
    fireEvent.click(invite);
    expect(screen.getByTestId('micro-challenge-card')).toBeTruthy();
    expect(screen.queryByTestId('green-alt-challenge-invite')).toBeNull();
  });

  it('gentle: 无任何追问尾句 — 无挑战入口且采纳确认行隐藏', () => {
    setGuardIntensity('gentle');
    render(<GreenAltCard data={data} />);
    expect(screen.queryByTestId('green-alt-challenge-invite')).toBeNull();
    expect(screen.queryByTestId('green-alt-adopt-button')).toBeNull();
    expect(screen.queryByTestId('green-alt-adopted-note')).toBeNull();
  });
});

// 🐘 batch62-b: 拒绝反馈区 — 4 个非羞辱原因 / 幂等 / 已确认态回放 / gentle 静默
describe('GreenAltCard × rejection feedback', () => {
  beforeEach(() => {
    setGreenPrefEnabled(true);
    _resetGuardIntensityStateForTest();
    // reset helper 置 sharedInitialized=false 后会重读 localStorage —
    // 前面 gentle 用例写入的 'symy-guard-intensity' 必须清掉, 否则本块读到 gentle
    window.localStorage.removeItem('symy-guard-intensity');
    _resetGreenAltAdoptionForTest();
    _resetGreenAltRejectionForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
    window.localStorage.removeItem('symy-guard-intensity');
    _resetGreenAltRejectionForTest();
    vi.doUnmock('@/components/chat-parts/green-alt-rejection');
  });

  function renderWithRejectionMock(reportMock: ReturnType<typeof vi.fn>) {
    vi.doMock('@/components/chat-parts/green-alt-rejection', () => ({
      latestGreenAltRejectionReason: () => null,
      reportGreenAltRejection: reportMock,
    }));
    vi.resetModules();
    return import('../green-alt-card');
  }

  it('未采纳时渲染反馈区: 标题 + 4 个原因按钮', async () => {
    await renderWithRejectionMock(vi.fn());
    const { GreenAltCard: Card } = await import('../green-alt-card');
    render(<Card data={data} />);
    expect(screen.getByTestId('green-alt-feedback')).toBeTruthy();
    expect(screen.getByText('Not quite the right fit?')).toBeTruthy();
    for (const reason of ['already_have', 'not_now', 'wrong_channel', 'prefer_buy']) {
      expect(screen.getByTestId(`green-alt-feedback-${reason}`)).toBeTruthy();
    }
  });

  it('点击 prefer_buy: 记账一次 + 确认态承认决定 (无说教追问)', async () => {
    const reportMock = vi.fn(async () => ({ status: 'recorded' as const }));
    await renderWithRejectionMock(reportMock);
    const { GreenAltCard: Card } = await import('../green-alt-card');
    render(<Card data={data} />);

    fireEvent.click(screen.getByTestId('green-alt-feedback-prefer_buy'));
    expect(await screen.findByTestId('green-alt-feedback-ack')).toBeTruthy();
    expect(screen.getByText("Okay — this time it's your call")).toBeTruthy();
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('fur', 'prefer_buy');
    // 已确认态: 按钮消失, 不可重复提交
    expect(screen.queryByTestId('green-alt-feedback-prefer_buy')).toBeNull();
    expect(screen.queryByTestId('green-alt-feedback-not_now')).toBeNull();
  });

  it('localStorage 已有拒绝记录: 初始即确认态 (跨会话回放)', () => {
    _seedGreenAltRejectionForTest('fur', 'not_now', Date.now());
    render(<GreenAltCard data={data} />);
    expect(screen.getByTestId('green-alt-feedback-ack')).toBeTruthy();
    expect(screen.getByText("Got it — we'll leave it for now")).toBeTruthy();
    expect(screen.queryByTestId('green-alt-feedback-already_have')).toBeNull();
  });

  it('已采纳的卡片不显示反馈区', () => {
    _seedGreenAltRejectionForTest('fur', 'not_now', Date.now() - 365 * 24 * 60 * 60 * 1000);
    vi.doMock('@/components/chat-parts/green-alt-adoption', () => ({
      isGreenAltAdoptionReported: () => true,
      reportGreenAltAdoption: vi.fn(),
    }));
    vi.resetModules();
    return import('../green-alt-card').then(({ GreenAltCard: Card }) => {
      render(<Card data={data} />);
      // 已确认态 (adoptedNote) 而非反馈区
      expect(screen.getByTestId('green-alt-adopted-note')).toBeTruthy();
      expect(screen.queryByTestId('green-alt-feedback')).toBeNull();
      vi.doUnmock('@/components/chat-parts/green-alt-adoption');
    });
  });

  it('gentle 档: 反馈区随追问类尾句一起静默', () => {
    setGuardIntensity('gentle');
    render(<GreenAltCard data={data} />);
    expect(screen.queryByTestId('green-alt-feedback')).toBeNull();
  });
});
