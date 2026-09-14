// @vitest-environment happy-dom

/**
 * CompareCard 测试 (batch56-a)
 *
 * 覆盖验收:
 * 1. 三种形态渲染: 单侧命中词条 / 双侧命中 / 双侧都无据
 * 2. 红线: 无据侧不得出现编造的环保声明 (无据形态不渲染任何词条 why 文案)
 * 3. 点选落账: health_events manual_adjustment + metadata
 *    {source=compare_decision, side_a/side_b/chosen/entry_a/entry_b/decision_key}
 *    + layered 回复按守护强度三档取文案
 * 4. 再想想 → 复用既有 24h 冷静 pending 通路 (cooldown-store)
 * i18n key 直接从真实 zh message 表读取 (无 defaultValue)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompareCard } from '../compare-card';
import { getDueCooldown, _resetCooldownStoreForTest } from '../cooldown-store';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

let intensity = 'balanced';
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = { zh: zh.chat.compare, en: en.chat.compare } as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.compare\./, '')
        .split('.')
        .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), table.zh);
      let result = typeof raw === 'string' ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: 'zh',
  }),
}));

vi.mock('@/hooks/use-guard-intensity', () => ({
  useGuardIntensity: () => ({ guardIntensity: intensity }),
}));

const MATCH = { id: 'secondhand_audio_tablet', why: '耳机和平板是个头小但换代最勤的电子件。', alternative: '先看二手。', reuse: '手头这台也许能再战两年。' };
const MATCH_B = { id: 'milk_tea', why: '奶茶杯是高频一次性垃圾。', alternative: '自带杯。', reuse: '家里有茶包。' };

afterEach(() => {
  cleanup();
  apiFetchMock.mockClear();
  intensity = 'balanced';
  _resetCooldownStoreForTest();
});

describe('CompareCard 三种形态', () => {
  it('单侧命中: 命中侧展示词条 why, 无据侧不出现任何词条文案', () => {
    render(<CompareCard data={{ sideA: 'iPad', sideB: 'kindle', matchA: MATCH, matchB: null }} />);
    const card = screen.getByTestId('compare-card');
    expect(card.textContent).toContain('iPad');
    expect(card.textContent).toContain('kindle');
    expect(screen.getAllByText(/耳机和平板/).length).toBeGreaterThan(0);
    // 无据形态的中性引导 (不瞎编环保账) 出现
    expect(screen.getByTestId('compare-alt-line').textContent).not.toContain('奶茶杯');
  });

  it('双侧命中: 两侧词条 why 并列展示', () => {
    render(<CompareCard data={{ sideA: 'iPad', sideB: '奶茶', matchA: MATCH, matchB: MATCH_B }} />);
    expect(screen.getAllByText(/耳机和平板/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/奶茶杯/).length).toBeGreaterThan(0);
  });

  it('双侧都无据: 走中性引导, 不出现任何词条 why (红线: 不编造环保声明)', () => {
    render(<CompareCard data={{ sideA: '木头桌子', sideB: '竹子桌子', matchA: null, matchB: null }} />);
    const altLine = screen.getByTestId('compare-alt-line').textContent || '';
    expect(altLine).not.toContain('耳机和平板');
    expect(altLine).not.toContain('奶茶杯');
    expect(altLine).toContain('先想想家里有没有能顶上的');
    // 无据 → 耐用行走中性引导, 不是词条引用版
    expect(screen.getByTestId('compare-card').textContent).toContain('两边耐用性本象没有可靠数据');
  });
});

describe('CompareCard 点选落账 + layered 回复', () => {
  it('选 A: manual_adjustment + source=compare_decision + 两侧对象词 + 选择侧 + 三档 balanced 文案', () => {
    render(<CompareCard data={{ sideA: 'iPad', sideB: 'kindle', matchA: MATCH, matchB: null }} />);
    fireEvent.click(screen.getByTestId('compare-choose-a'));

    expect(screen.getByTestId('compare-chosen-reply').textContent).toContain('iPad');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.method).toBe('POST');
    expect(opts.body.eventType).toBe('manual_adjustment');
    const meta = opts.body.metadata as Record<string, unknown>;
    expect(meta.source).toBe('compare_decision');
    expect(meta.side_a).toBe('iPad');
    expect(meta.side_b).toBe('kindle');
    expect(meta.chosen).toBe('a');
    expect(meta.entry_a).toBe('secondhand_audio_tablet');
    expect(meta.entry_b).toBeNull();
    expect(String(meta.decision_key)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('选 B + strict 档: layered 回复读取 strict 文案', () => {
    intensity = 'strict';
    render(<CompareCard data={{ sideA: 'iPad', sideB: 'kindle', matchA: null, matchB: null }} />);
    fireEvent.click(screen.getByTestId('compare-choose-b'));
    expect(screen.getByTestId('compare-chosen-reply').textContent).toContain('这个理由还能再用一次');
    const meta = (apiFetchMock.mock.calls[0] as [string, { body: Record<string, unknown> }])[1].body.metadata as Record<string, unknown>;
    expect(meta.chosen).toBe('b');
  });

  it('再想想: 落账 chosen=think + 复用既有 24h 冷静 pending 通路', () => {
    intensity = 'gentle';
    render(<CompareCard data={{ sideA: 'iPad', sideB: 'kindle', matchA: null, matchB: null }} />);
    fireEvent.click(screen.getByTestId('compare-choose-think'));

    expect(screen.getByTestId('compare-chosen-reply').textContent).toContain('不急');
    const pending = getDueCooldown(Date.now() + 25 * 60 * 60 * 1000);
    expect(pending).not.toBeNull();
    expect(pending!.userChoseBuy).toBe(false);
    const meta = (apiFetchMock.mock.calls[0] as [string, { body: Record<string, unknown> }])[1].body.metadata as Record<string, unknown>;
    expect(meta.chosen).toBe('think');
  });

  it('防连点: 选择后 chips 消解, 只落账一次', () => {
    render(<CompareCard data={{ sideA: 'iPad', sideB: 'kindle', matchA: null, matchB: null }} />);
    fireEvent.click(screen.getByTestId('compare-choose-a'));
    expect(screen.queryByTestId('compare-choose-b')).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
