// @vitest-environment happy-dom

/**
 * ListTriageCard 测试 (batch57-a)
 *
 * 覆盖验收:
 * 1. 三种形态渲染: 全绿灯 / 混合三态 / exempt 品类静默放行 (归绿灯, 无说教)
 * 2. 红线: 无词条命中的条目不得出现编造环保声明 (绿灯行不含任何词条 why 文案)
 * 3. 每条目动作 chip: 就买/看替代/再想想 → layered 回复按守护强度三档取文案,
 *    落账 health_events manual_adjustment + metadata
 *    {source=list_triage, item, verdict, alt_id, action, decision_key}
 * 4. 卡尾合计纯计数, 零金额零碳数值
 * i18n key 直接从真实 zh message 表读取 (无 defaultValue)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListTriageCard } from '../list-triage-card';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

let intensity = 'balanced';
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = { zh: zh.chat.listTriage, en: en.chat.listTriage } as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.listTriage\./, '')
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

const ALT_ITEM = {
  word: '奶茶',
  verdict: 'alt' as const,
  altId: 'milk_tea',
  why: '奶茶果茶是频率最高的包装消耗之一。',
  alternative: '自带杯。',
  category: 'other',
};
const THINK_ITEM = {
  word: '跑鞋',
  verdict: 'think' as const,
  altId: null,
  why: null,
  alternative: null,
  category: 'clothing',
};
const GREEN_ITEM = {
  word: '新键盘',
  verdict: 'green' as const,
  altId: null,
  why: null,
  alternative: null,
  category: 'other',
};

afterEach(() => {
  cleanup();
  apiFetchMock.mockClear();
  intensity = 'balanced';
});

describe('ListTriageCard 三种形态', () => {
  it('混合三态: 绿灯/替代/想清楚逐条渲染, 词条 why+alternative 引用, 合计纯计数', () => {
    render(
      <ListTriageCard
        data={{
          items: [GREEN_ITEM, ALT_ITEM, THINK_ITEM],
          summary: { total: 3, green: 1, alt: 1, think: 1 },
        }}
      />,
    );
    const card = screen.getByTestId('list-triage-card');
    expect(card.textContent).toContain('新键盘');
    expect(card.textContent).toContain('奶茶');
    expect(card.textContent).toContain('跑鞋');
    expect(card.textContent).toContain('包装消耗');
    expect(screen.getByTestId('list-triage-alt-detail').textContent).toContain('自带杯');
    // 想清楚行是邀请式引导, 不是词条文案
    expect(card.textContent).toContain('真需要还是刚好想要');
    // 合计纯计数 (含数字计数, 不含金额/碳)
    const summary = screen.getByTestId('list-triage-summary').textContent || '';
    expect(summary).toContain('3 项中');
    expect(summary).toContain('1 项绿灯');
    expect(summary).not.toMatch(/[$¥￥]|kg|CO2|碳排/);
  });

  it('全绿灯形态: 每条都是平静放行陈述, 合计 0 替代 0 再想', () => {
    render(
      <ListTriageCard
        data={{ items: [GREEN_ITEM], summary: { total: 1, green: 1, alt: 0, think: 0 } }}
      />,
    );
    const card = screen.getByTestId('list-triage-card');
    expect(card.textContent).toContain('没什么风险');
    expect(card.textContent).not.toContain('包装消耗');
    expect(screen.getByTestId('list-triage-summary').textContent).toContain('0 项有替代');
  });

  it('exempt 静默放行形态: 豁免品类条目按绿灯渲染, 不出现追问或替代文案 (53-b)', () => {
    render(
      <ListTriageCard
        data={{ items: [{ ...THINK_ITEM, verdict: 'green', category: 'clothing' }], summary: { total: 1, green: 1, alt: 0, think: 0 } }}
      />,
    );
    const card = screen.getByTestId('list-triage-card');
    expect(card.textContent).toContain('没什么风险');
    expect(card.textContent).not.toContain('真需要还是刚好想要');
  });

  it('红线: 无词条命中的条目不出现编造环保声明', () => {
    render(
      <ListTriageCard
        data={{ items: [GREEN_ITEM, THINK_ITEM], summary: { total: 2, green: 1, alt: 0, think: 1 } }}
      />,
    );
    const card = screen.getByTestId('list-triage-card');
    // 无词条 → 不引用任何词条文案, 不出现环保断言词
    expect(card.textContent).not.toContain('环保');
    expect(card.textContent).not.toContain('包装消耗');
  });
});

describe('ListTriageCard 动作 chip 落账 + layered 回复', () => {
  it('看替代: manual_adjustment + source=list_triage + 条目词 + 三态判定 + 词条 id + 日期键', () => {
    render(
      <ListTriageCard
        data={{ items: [ALT_ITEM], summary: { total: 1, green: 0, alt: 1, think: 0 } }}
      />,
    );
    fireEvent.click(screen.getByTestId('list-triage-alt'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.method).toBe('POST');
    expect(opts.body.eventType).toBe('manual_adjustment');
    const meta = opts.body.metadata as Record<string, unknown>;
    expect(meta.source).toBe('list_triage');
    expect(meta.item).toBe('奶茶');
    expect(meta.verdict).toBe('alt');
    expect(meta.alt_id).toBe('milk_tea');
    expect(meta.action).toBe('alt');
    expect(meta.category).toBe('other');
    expect(String(meta.decision_key)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // balanced 档 layered 回复
    expect(screen.getByTestId('list-triage-item-reply').textContent).toContain('替代方案值得试一次');
  });

  it('strict 档: 再想想读取 strict 文案', () => {
    intensity = 'strict';
    render(
      <ListTriageCard
        data={{ items: [THINK_ITEM], summary: { total: 1, green: 0, alt: 0, think: 1 } }}
      />,
    );
    fireEvent.click(screen.getByTestId('list-triage-think'));
    expect(screen.getByTestId('list-triage-item-reply').textContent).toContain('秘密武器');
  });

  it('gentle 档: 就买读取 gentle 文案', () => {
    intensity = 'gentle';
    render(
      <ListTriageCard
        data={{ items: [GREEN_ITEM], summary: { total: 1, green: 1, alt: 0, think: 0 } }}
      />,
    );
    fireEvent.click(screen.getByTestId('list-triage-buy'));
    expect(screen.getByTestId('list-triage-item-reply').textContent).toContain('就它啦');
  });

  it('条目间独立 + 防连点: 条目 A 选择后条目 B 仍可选, A 只落账一次', () => {
    render(
      <ListTriageCard
        data={{ items: [ALT_ITEM, THINK_ITEM], summary: { total: 2, green: 0, alt: 1, think: 1 } }}
      />,
    );
    fireEvent.click(screen.getAllByTestId('list-triage-alt')[0]);
    // 同一条目连点不重复落账
    expect(screen.queryAllByTestId('list-triage-alt').length).toBe(1);
    // 另一条目 chips 仍在, 可独立选择
    fireEvent.click(screen.getByTestId('list-triage-think'));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const meta2 = (apiFetchMock.mock.calls[1] as [string, { body: Record<string, unknown> }])[1].body.metadata as Record<string, unknown>;
    expect(meta2.item).toBe('跑鞋');
    // 有选择后合计行附私享一句 (仅 App 内)
    expect(screen.getByTestId('list-triage-summary').textContent).toContain('私享账本');
  });
});
