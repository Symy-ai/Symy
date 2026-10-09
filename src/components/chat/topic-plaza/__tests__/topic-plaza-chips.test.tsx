// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dict: Record<string, string> = {};
for (const id of TOPIC_PLAZA_CHIP_IDS) dict[topicPlazaChipKey(id)] = `文案:${id}`;
const stableT = (key: string) => dict[key] ?? key;

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { TOPIC_PLAZA_CHIP_IDS, TopicPlazaChips, topicPlazaChipKey } from '../topic-plaza-chips';

/**
 * topic-plaza-chips.tsx (57行) — 话题广场 chip 组 (batch55-a, 纯静态 i18n)。
 *
 * 锁定:
 * - 九 chip 按 TOPIC_PLAZA_CHIP_IDS 顺序渲染 (id 序=展示序)
 * - 点击 chip → onQuickReply(该 chip 文本) (走现有 detection 管线)
 * - key 律 chat.topicPlaza.items.{id}
 */
describe('TopicPlazaChips 话题广场', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('九 chip 按序渲染', () => {
    render(<TopicPlazaChips onQuickReply={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(9);
    buttons.forEach((b, i) => {
      expect(b.textContent).toBe(`文案:${TOPIC_PLAZA_CHIP_IDS[i]}`);
    });
  });

  it('点击 → onQuickReply(chip 文本)', () => {
    const onQuickReply = vi.fn();
    render(<TopicPlazaChips onQuickReply={onQuickReply} />);
    fireEvent.click(screen.getByText('文案:commitmentCoffee'));
    expect(onQuickReply).toHaveBeenCalledTimes(1);
    expect(onQuickReply).toHaveBeenCalledWith('文案:commitmentCoffee');
  });

  it('key 律: chip id → chat.topicPlaza.items.{id}', () => {
    expect(topicPlazaChipKey('prepurchase')).toBe('chat.topicPlaza.items.prepurchase');
    expect(topicPlazaChipKey('savingsQuery')).toBe('chat.topicPlaza.items.savingsQuery');
  });

  it('九 id 全部词表可译 (无 key 泄漏到 UI)', () => {
    render(<TopicPlazaChips onQuickReply={vi.fn()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.textContent).not.toContain('chat.topicPlaza'); // 落 dict 命中, 不露 key
    }
  });
});
