// @vitest-environment happy-dom

/**
 * GuardMomentsCard / GuardMomentsEntry 测试 — 守护时刻时间线 (batch58-a)
 *
 * 覆盖: 倒序 + 月分组 + 三类徽标渲染; 累计金额只出现在 App 内页面;
 * 分享面结构性 amount-free (红线锁); 空态可渲染无 console 报错;
 * 入口条渲染。i18n key 直接从真实 zh message 表读取 (无 defaultValue)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardMomentsCard } from '../guard-moments';
import { GuardMomentsEntry } from '../guard-moments-entry';
import { aggregateGuardMoments, type GuardMomentEventInput } from '@/lib/guard-moments';
import zh from '../../../../i18n/messages/zh.json';

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

function events(): GuardMomentEventInput[] {
  return [
    { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 120 }, createdAt: new Date(2026, 8, 7, 10).toISOString() },
    { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', estSaved: 30 }, createdAt: new Date(2026, 8, 6, 9).toISOString() },
    { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption', estSaved: 15 }, createdAt: new Date(2026, 7, 20, 15).toISOString() },
  ];
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('GuardMomentsEntry', () => {
  it('渲染固定入口条: 只出引导语, 不出数字', () => {
    const onOpen = vi.fn();
    render(<GuardMomentsEntry onOpen={onOpen} />);
    const entry = screen.getByTestId('guard-moments-entry');
    expect(entry.textContent).toContain('守护时刻');
    expect(entry.textContent).not.toMatch(/\d/);
    fireEvent.click(entry);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('GuardMomentsCard', () => {
  it('倒序时间线: 月分组倒序 + 组内倒序 + 三类徽标 (testid) 均出现', () => {
    render(<GuardMomentsCard timeline={aggregateGuardMoments(events())} onClose={vi.fn()} />);

    const months = screen.getAllByTestId('guard-moments-month');
    expect(months.length).toBe(2);
    expect(months[0].textContent).toContain('2026');
    expect(months[0].textContent).toContain('9');
    expect(months[1].textContent).toContain('8');

    // 2026-09 组内 guard 在 alt 之前 (倒序)
    const list = screen.getByTestId('guard-moments-list');
    const guardIdx = list.textContent!.indexOf('冲动被温柔拦下');
    const altIdx = list.textContent!.indexOf('更绿色的替代');
    const reuseIdx = list.textContent!.indexOf('再用了一次');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(altIdx);
    expect(altIdx).toBeLessThan(reuseIdx);

    expect(screen.getAllByTestId('guard-moment-guard').length).toBe(1);
    expect(screen.getAllByTestId('guard-moment-alt').length).toBe(1);
    expect(screen.getAllByTestId('guard-moment-reuse').length).toBe(1);

    // 顶部汇总行: 总次数 + 天数
    expect(screen.getByTestId('guard-moments-summary').textContent).toContain('3');
    expect(screen.getByTestId('guard-moments-summary').textContent).toContain('3');
  });

  it('累计金额只出现在 App 内页面: 私享行 + 单条 estSaved', () => {
    render(<GuardMomentsCard timeline={aggregateGuardMoments(events())} onClose={vi.fn()} />);
    expect(screen.getByTestId('guard-moments-saved-private').textContent).toContain('¥165');
    expect(screen.getAllByTestId('guard-moment-saved').length).toBe(3);
  });

  it('红线: 分享面打开且结构性 amount-free (私享行/单条金额绝不进分享面)', () => {
    render(<GuardMomentsCard timeline={aggregateGuardMoments(events())} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('guard-moments-share-btn'));

    const face = screen.getByTestId('guard-moments-share-face');
    expect(face.textContent).not.toMatch(/¥\d/);
    expect(face.textContent).not.toMatch(/\$\d/);
    expect(face.textContent).not.toMatch(/\d+\.\d\d/);
    // 私享行文案绝不进分享面
    expect(face.textContent).not.toContain('仅自己可见');
    expect(face.textContent).not.toContain('省下约');
  });

  it('空态可渲染, 无 console 报错', () => {
    render(<GuardMomentsCard timeline={aggregateGuardMoments([])} onClose={vi.fn()} />);
    const empty = screen.getByTestId('guard-moments-empty');
    expect(empty.textContent).toContain('第一次拦截');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('关闭按钮回调', () => {
    const onClose = vi.fn();
    render(<GuardMomentsCard timeline={aggregateGuardMoments(events())} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
