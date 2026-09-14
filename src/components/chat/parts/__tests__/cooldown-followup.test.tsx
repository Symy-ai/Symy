// @vitest-environment happy-dom

/**
 * CooldownFollowup 测试 — 冷静卡次日回访条两分支 (batch48-b)
 *
 * 覆盖: 渲染回访问题与二选一; 还想要 → 祝福 + 零上报; 不要了 → 计数上报
 * (manual_adjustment 纯审计, 零金额) + 成功文案; 两分支都消解记录 (一次性)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CooldownFollowup } from '../cooldown-followup';
import { _resetCooldownStoreForTest, getDueCooldown, savePendingCooldown } from '../cooldown-store';
import type { PendingCooldownFollowup } from '@/types/cooldown';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      ({
        'chat.cooldown.itemGeneric': 'that thing you wanted',
        'chat.cooldown.followupQuestion': `That ${vars?.item ?? ''} from yesterday — still want it?`,
        'chat.cooldown.followupStillWant': 'Still want it',
        'chat.cooldown.followupLetGo': 'Let it go',
        'chat.cooldown.followupBlessing': 'Enjoy it with your new thing! 🐘',
        'chat.cooldown.followupSuccessNote': 'Calm guard success — counted! 🌱',
        'chat.cooldown.itemName.clothing': 'piece of clothing',
      })[key] || key,
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const record: PendingCooldownFollowup = {
  category: 'clothing',
  askedAt: Date.now() - 25 * 60 * 60 * 1000,
  dueAt: Date.now() - 60_000, // 已到期
  userChoseBuy: false,
};

describe('CooldownFollowup (次日一次性回访条)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    _resetCooldownStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetCooldownStoreForTest();
  });

  it('渲染回访问题 (含条目名) 与二选一按钮', () => {
    render(<CooldownFollowup record={record} />);
    expect(screen.getByTestId('cooldown-followup').textContent).toContain('piece of clothing');
    expect(screen.getByTestId('cooldown-followup').textContent).toContain('still want it');
    expect(screen.getByTestId('cooldown-followup-want').textContent).toBe('Still want it');
    expect(screen.getByTestId('cooldown-followup-passed').textContent).toBe('Let it go');
  });

  it('还想要 → 真诚祝福, 零上报 (买了不评判), 记录消解', () => {
    savePendingCooldown(record);
    render(<CooldownFollowup record={record} />);
    fireEvent.click(screen.getByTestId('cooldown-followup-want'));

    expect(screen.getByTestId('cooldown-followup-answered').textContent).toContain('Enjoy it');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(getDueCooldown()).toBeNull();
  });

  it('不要了 → 计数进守护统计 (manual_adjustment 纯审计, 零金额) + 成功文案', () => {
    savePendingCooldown(record);
    render(<CooldownFollowup record={record} />);
    fireEvent.click(screen.getByTestId('cooldown-followup-passed'));

    expect(screen.getByTestId('cooldown-followup-answered').textContent).toContain('counted');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.method).toBe('POST');
    expect(init.body.eventType).toBe('manual_adjustment');
    expect(init.body.triggerSource).toBe('manual');
    // 口径红线: 只计次数, payload 零金额
    expect(JSON.stringify(init.body)).not.toMatch(/amount|saved/i);
    expect(getDueCooldown()).toBeNull();
  });

  it('上报失败静默 — 成功文案照常, 不追问第二遍', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network'));
    savePendingCooldown(record);
    render(<CooldownFollowup record={record} />);
    fireEvent.click(screen.getByTestId('cooldown-followup-passed'));

    expect(screen.getByTestId('cooldown-followup-answered').textContent).toContain('counted');
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(getDueCooldown()).toBeNull();
  });
});
