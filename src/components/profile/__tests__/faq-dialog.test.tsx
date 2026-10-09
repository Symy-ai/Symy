// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<[string]> = [];
const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'profile.faqDialogTitle': '认识 Symy',
    'profile.faqGuardTitle': '什么是守护挑战?',
    'profile.faqGreenSwapTitle': '什么是绿色替代?',
    'profile.faqMedalTitle': '什么是守护勋章?',
    'profile.faqDreamFundTitle': '什么是梦想基金?',
    'profile.faqRitualTitle': '什么是每日仪式?',
    'profile.faqSymyTitle': 'Symy 是谁?',
    'profile.faqFooter': '还不明白? 直接问 Symy',
    'common.close': '关闭',
  };
  calls.push([key]);
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { FaqDialog } from '../faq-dialog';

/**
 * faq-dialog.tsx (136行) — 认识 Symy 帮助弹窗 (PM-#28 死链修复+batch7-c 概念课)。
 *
 * 锁定:
 * - open=false → null; open → 六概念问答渲染
 * - ESC/遮罩/关闭钮 三路 onClose
 * - 内容 stopPropagation (点内容不关)
 */
describe('FaqDialog 帮助弹窗', () => {
  beforeEach(() => calls.length = 0);
  afterEach(() => cleanup());

  it('open=false → null; open → 六问答+标题+鼓励语', () => {
    const { container } = render(<FaqDialog open={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    render(<FaqDialog open onClose={vi.fn()} />);
    expect(screen.getByText('认识 Symy')).toBeTruthy();
    for (const q of ['什么是守护挑战?', '什么是绿色替代?', '什么是守护勋章?', '什么是梦想基金?', '什么是每日仪式?', 'Symy 是谁?']) {
      expect(screen.getByText(q)).toBeTruthy();
    }
    expect(screen.getByText('还不明白? 直接问 Symy')).toBeTruthy();
  });

  it('ESC/遮罩点击/关闭钮 → onClose 三路', () => {
    const onClose = vi.fn();
    render(<FaqDialog open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement); // 遮罩
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('点内容不关 (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<FaqDialog open onClose={onClose} />);
    fireEvent.click(screen.getByText('认识 Symy')); // 标题在内容卡内
    expect(onClose).not.toHaveBeenCalled();
  });
});
