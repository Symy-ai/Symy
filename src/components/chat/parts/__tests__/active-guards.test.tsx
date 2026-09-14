// @vitest-environment happy-dom
/* eslint-disable require-await */

/**
 * ActiveGuardsPanel / ActiveGuardsEntry 测试 — 进行中守护面板 (batch59-a)
 *
 * 覆盖: 三类区块渲染 + 身份线; 私享金额只出现在 App 内页面; SOS 点击写
 * health_events manual_adjustment (source=guard_sos + 引用项 key + triggerId
 * 日期键) 且收尾暖句无羞辱词; 分享面结构性 amount-free (红线锁); 空态 +
 * 最近胜利激励; 入口条渲染。i18n key 直接从真实 zh message 表读取 (无 defaultValue)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActiveGuardsPanel } from '../active-guards-panel';
import { ActiveGuardsEntry } from '../active-guards-entry';
import {
  aggregateActiveGuards,
  type ActiveGuardsEventInput,
} from '@/lib/active-guards';
import type { GuardMoment } from '@/lib/guard-moments';
import zh from '../../../../i18n/messages/zh.json';

const apiFetchMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const raw = key
        .split('.')
        .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), zh);
      let result = typeof raw === 'string' ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: 'zh',
  }),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/hooks/use-guard-intensity', () => ({
  useGuardIntensity: () => ({ guardIntensity: 'balanced', setGuardIntensity: vi.fn() }),
}));

const NOW = new Date(2026, 8, 9, 12);

function summary() {
  const events: ActiveGuardsEventInput[] = [
    {
      eventType: 'manual_adjustment',
      triggerId: null,
      metadata: { source: 'green_commitment', category: 'food', subject: '外卖', start_key: '2026-09-01', end_key: '2026-09-30' },
      createdAt: new Date(2026, 8, 1, 9).toISOString(),
    },
    { eventType: 'challenge_completed', triggerId: 't1', metadata: { category: 'food', savedAmount: 35 }, createdAt: new Date(2026, 8, 5, 20).toISOString() },
  ];
  return aggregateActiveGuards({
    now: NOW,
    challenge: { id: 'c1', itemName: '耳机', amount: 299, createdAt: new Date(2026, 8, 9, 6).toISOString() },
    events,
    cooldown: { subject: '跑鞋', askedAt: NOW.getTime() - 6 * 3600000, dueAt: NOW.getTime() + 18 * 3600000, amount: 400 },
  });
}

const LATEST_WIN: GuardMoment = {
  id: 'm1',
  track: 'guard',
  date: new Date(2026, 8, 7, 10),
  estSaved: 120,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  apiFetchMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('ActiveGuardsEntry', () => {
  it('渲染固定入口条: 只出引导语, 不出数字', () => {
    const onOpen = vi.fn();
    render(<ActiveGuardsEntry onOpen={onOpen} />);
    const entry = screen.getByTestId('active-guards-entry');
    expect(entry.textContent).toContain('守护正在进行中');
    expect(entry.textContent).not.toMatch(/\d/);
    fireEvent.click(entry);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('ActiveGuardsPanel', () => {
  it('三类区块 + 身份线 + 私享金额 (App 内) 均渲染', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={LATEST_WIN} onClose={vi.fn()} />);

    const identity = screen.getByTestId('active-guards-identity');
    expect(identity.textContent).toContain('3');
    expect(identity.textContent).toContain('9');

    expect(screen.getAllByTestId('active-guards-challenge').length).toBe(1);
    expect(screen.getAllByTestId('active-guards-commitment').length).toBe(1);
    expect(screen.getAllByTestId('active-guards-cooldown').length).toBe(1);

    // 剩余时间: 挑战 18h / 承诺 21 天 / 冷静期 18h
    expect(screen.getByTestId('active-guards-challenge-remaining').textContent).toContain('18');
    expect(screen.getByTestId('active-guards-commitment-remaining').textContent).toContain('21');
    expect(screen.getByTestId('active-guards-commitment-assist').textContent).toContain('1');
    expect(screen.getByTestId('active-guards-cooldown-remaining').textContent).toContain('18');

    // 私享金额: 299 (挑战) + 35 (承诺助攻) + 400 (冷静期) — 仅 App 内
    const savedTexts = screen.getAllByTestId('active-guards-item-saved').map((n) => n.textContent).join('|');
    expect(savedTexts).toContain('¥299');
    expect(savedTexts).toContain('¥35');
    expect(savedTexts).toContain('¥400');
  });

  it('SOS: 点击按钮打开三档回应, 选择后写 guard_sos 事件并展示收尾暖句', async () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByTestId('active-guards-sos-btn')[0]);
    expect(screen.getByTestId('active-guards-sos-lead').textContent).toContain('本象在');
    expect(screen.getByTestId('active-guards-sos-hold').textContent).toContain('18');

    fireEvent.click(screen.getByTestId('active-guards-sos-release'));
    const done = await screen.findByTestId('active-guards-sos-done');
    expect(done.textContent).toContain('放过自己也是一种坚持');

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const call = apiFetchMock.mock.calls[0] as unknown as [string, { method: string; body: Record<string, unknown> }];
    const [url, options] = call;
    expect(url).toBe('/api/buddy/health-events');
    expect(options.method).toBe('POST');
    expect(options.body.eventType).toBe('manual_adjustment');
    expect(options.body.triggerId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(options.body.metadata).toEqual({
      source: 'guard_sos',
      ref_kind: 'challenge',
      ref_key: 'c1',
      choice: 'release',
    });
  });

  it('红线: 分享面打开且结构性 amount-free (私享金额/私享文案绝不进分享面)', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={LATEST_WIN} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('active-guards-share-btn'));

    const face = screen.getByTestId('active-guards-share-face');
    expect(face.textContent).not.toMatch(/¥\d/);
    expect(face.textContent).not.toMatch(/\$\d/);
    expect(face.textContent).not.toContain('仅自己可见');
    expect(face.textContent).not.toContain('预计守护');
    // 身份故事字段: 件数 + 天数
    expect(face.textContent).toContain('3');
    expect(face.textContent).toContain('9');
  });

  it('空态: 引导文案 + 最近胜利激励, 无 SOS/分享入口', () => {
    const empty = aggregateActiveGuards({ now: NOW, challenge: null, events: [], cooldown: null });
    render(<ActiveGuardsPanel summary={empty} latestWin={LATEST_WIN} onClose={vi.fn()} />);

    const node = screen.getByTestId('active-guards-empty');
    expect(node.textContent).toContain('没有进行中的守护');
    expect(screen.getByTestId('active-guards-latest-win').textContent).toContain('9月7日');
    expect(screen.queryByTestId('active-guards-sos-btn')).toBeNull();
    expect(screen.queryByTestId('active-guards-share-btn')).toBeNull();
  });

  it('关闭按钮回调', () => {
    const onClose = vi.fn();
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
