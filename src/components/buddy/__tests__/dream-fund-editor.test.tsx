// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DreamFundEditor } from '../dream-fund-editor';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import type { DreamFund } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, values?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'buddy.dreamFundAdd': '添加基金',
        'buddy.dreamFundEdit': '编辑基金',
        'buddy.dreamFundSave': '保存',
        'buddy.dreamFundCreate': '创建',
        'buddy.dreamFundCreated': '基金已创建',
        'buddy.dreamFundUpdated': '基金已更新',
        'buddy.dreamFundDuplicateName': '基金名称已存在',
        'buddy.dreamFundMaxError': `最高 $${String(values?.max ?? '2,147,483,647')}`,
        'buddy.setNewGoalTitle': '设定新目标',
        'buddy.dreamFund.suggestions.home': '一个家',
        'buddy.dreamFund.suggestions.travel': '一场旅行',
        'buddy.dreamFundEmoji': '图标',
        'buddy.dreamFundName': '基金名称',
        'buddy.dreamFundTarget': '目标金额',
        'buddy.dreamFund.emojiPickerLabel': '选择图标',
        'common.cancel': '取消',
      };
      return translations[key] ?? key;
    },
  }),
}));

const fund = (overrides: Partial<DreamFund> = {}): DreamFund => ({
  id: 'fund-1',
  name: 'Japan Trip',
  target: 2000,
  current: 500,
  emoji: '✈️',
  ...overrides,
});

const renderEditor = (overrides: Partial<Parameters<typeof DreamFundEditor>[0]> = {}) =>
  render(
    <DreamFundEditor
      open
      editingFund={null}
      mode="create"
      existingFunds={[fund()]}
      onClose={vi.fn()}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      {...overrides}
    />,
  );

afterEach(() => {
  cleanup();
});

describe('DreamFundEditor', () => {
  it('renders nothing when closed', () => {
    const { container } = renderEditor({ open: false });
    expect(container.innerHTML).toBe('');
    expect(document.body.textContent).not.toContain('基金名称');
  });

  it('creates a fund from a suggestion', () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    renderEditor({ onCreate, onClose, existingFunds: [] });

    fireEvent.click(screen.getByRole('button', { name: /一个家/ }));
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(onCreate).toHaveBeenCalledWith({ name: '一个家', target: 50000, current: 0, emoji: '🏠' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('edits an existing fund and closes after saving', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    renderEditor({ editingFund: fund(), mode: 'edit', onUpdate, onClose });

    fireEvent.change(screen.getByLabelText('基金名称'), { target: { value: 'Japan 2027' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3000' } });
    fireEvent.click(screen.getAllByRole('button', { name: '选择图标' })[10]);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onUpdate).toHaveBeenCalledWith('fund-1', { name: 'Japan 2027', target: 3000, emoji: '🎯' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate name before save', () => {
    const onToast = vi.fn();
    const onUpdate = vi.fn();
    renderEditor({
      editingFund: fund(),
      mode: 'edit',
      existingFunds: [fund(), fund({ id: 'fund-2', name: 'japan trip', emoji: '🎯' })],
      onUpdate,
      onToast,
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onToast).toHaveBeenCalledWith('基金名称已存在', 'info');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('blocks invalid targets with inline boundaries', () => {
    renderEditor();
    const target = screen.getByRole('spinbutton');
    const submit = screen.getByRole('button', { name: '创建' });

    fireEvent.change(target, { target: { value: '99' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(target, { target: { value: '2147483648' } });
    expect(screen.getByText(/最高/).textContent).toContain('最高');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses setNewGoal mode independently of editingFund', () => {
    renderEditor({ editingFund: fund(), mode: 'setNewGoal' });

    expect(screen.getByText('设定新目标').textContent).toBe('设定新目标');
    expect(screen.getByRole('button', { name: /一场旅行/ }).textContent).toContain('一场旅行');
  });

  it('keeps the savings fund unlimited and submittable', () => {
    const onUpdate = vi.fn();
    renderEditor({
      editingFund: fund({ id: SAVINGS_FUND_ID, name: 'Savings', target: 2147483647, emoji: '🏦' }),
      mode: 'edit',
      existingFunds: [fund({ id: SAVINGS_FUND_ID, name: 'Savings', target: 2147483647, emoji: '🏦' })],
      onUpdate,
    });

    expect((screen.getByDisplayValue('∞') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onUpdate).toHaveBeenCalledWith(SAVINGS_FUND_ID, { name: 'Savings', target: 2147483647, emoji: '🏦' });
  });

  it('closes on Escape and backdrop clicks without submitting', () => {
    const onClose = vi.fn();
    renderEditor({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.body.lastElementChild as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
