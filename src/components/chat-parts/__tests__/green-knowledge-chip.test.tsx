// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GreenKnowledgeChip } from '../green-knowledge-chip';
// 用真实 use-green-pref (共享状态 + localStorage), 走开关静默路径
import { _resetGreenPrefStateForTest, setGreenPrefEnabled } from '@/hooks/use-green-pref';
import type { GreenKnowledgeCardData } from '@/types/green-knowledge';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: { label?: string }) =>
      ({
        'chat.greenKnowledge.title': 'Knowledge source',
        'chat.greenKnowledge.optionsTitle': 'Greener options',
        'chat.greenKnowledge.channelTitle': 'Secondhand & rental channels',
      })[key]
        || (key === 'chat.greenKnowledge.chipLabel' ? `Entry: ${values?.label ?? ''}` : key),
  }),
}));

const data: GreenKnowledgeCardData = {
  entries: [
    {
      id: 'refurb_gadget',
      label: 'Refurbished',
      why: 'Laptops and phones carry the heaviest embedded footprint of household electronics.',
      options: ['Certified refurbished units', "Last year's model"],
      reuseChannel: 'Secondhand marketplaces and maker refurb stores both list well-kept units.',
    },
  ],
};

describe('GreenKnowledgeChip', () => {
  afterEach(() => {
    cleanup();
    _resetGreenPrefStateForTest();
  });

  it('渲染 chip 标签; 默认收起面板', () => {
    render(<GreenKnowledgeChip data={data} />);
    expect(screen.getByTestId('green-knowledge-chip')).toBeTruthy();
    expect(screen.getByText('Entry: Refurbished')).toBeTruthy();
    expect(screen.queryByTestId('green-knowledge-panel')).toBeNull();
  });

  it('点击 chip: 展开词条的替代选项与二手渠道', () => {
    render(<GreenKnowledgeChip data={data} />);
    fireEvent.click(screen.getByTestId('green-knowledge-chip-toggle'));
    const panel = screen.getByTestId('green-knowledge-panel');
    expect(panel.textContent).toContain(data.entries[0].options[0]);
    expect(panel.textContent).toContain(data.entries[0].reuseChannel);
  });

  it('再次点击: 收起面板', () => {
    render(<GreenKnowledgeChip data={data} />);
    const toggle = screen.getByTestId('green-knowledge-chip-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('green-knowledge-panel')).toBeNull();
  });

  it('多词条命中: 每词条一个 chip, 展开互不干扰', () => {
    const multi: GreenKnowledgeCardData = {
      entries: [
        ...data.entries,
        {
          id: 'repair_first',
          label: 'Repair first',
          why: 'Most gadget failures come down to a single part.',
          options: ['Official screen or battery service'],
          reuseChannel: 'Authorized shops quote friendlier than official rates.',
        },
      ],
    };
    render(<GreenKnowledgeChip data={multi} />);
    const toggles = screen.getAllByTestId('green-knowledge-chip-toggle');
    expect(toggles.length).toBe(2);
    fireEvent.click(toggles[1]);
    expect(screen.getByTestId('green-knowledge-panel').textContent).toContain('Official screen');
  });

  it('绿色守护关闭: 整体静默不渲染', () => {
    setGreenPrefEnabled(false);
    const { container } = render(<GreenKnowledgeChip data={data} />);
    expect(container.querySelector('[data-testid="green-knowledge-chip"]')).toBeNull();
  });

  it('无链接跳转, 无金额符号', () => {
    setGreenPrefEnabled(true);
    const { container } = render(<GreenKnowledgeChip data={data} />);
    fireEvent.click(screen.getByTestId('green-knowledge-chip-toggle'));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toMatch(/[$¥€]\s?\d/);
  });
});
