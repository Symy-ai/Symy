// @vitest-environment happy-dom

/**
 * ContextSignalChips 测试 — 信号词展示与会话纠正 (batch61-b)
 *
 * 覆盖: zh/en 展示词按 locale 取 (双语); 点 ✕ 写 sessionStorage (会话级纠正
 * 记录) 并隐藏对应 chip; 全部纠正后显示收到的话 (可纠正闭环); 已纠正词条
 * 重挂载不复活 (storage 读取); 展示词零数字。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContextSignalChips } from '../context-signal-chips';
import { dismissContextSignal, readDismissedContextSignals } from '../context-signal-store';
import type { ContextSignalData } from '@/types/context-signal';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: (globalThis as unknown as { __testLocale?: 'zh' | 'en' }).__testLocale ?? 'zh',
    t: (key: string) => {
      const dict: Record<string, string> = {
        'chat.contextSignal.prefix': '小象听到的信号',
        'chat.contextSignal.dismiss': '不是因为这个',
        'chat.contextSignal.corrected': '收到，下次不按这个理解啦',
      };
      return dict[key] ?? key;
    },
  }),
}));

const DATA: ContextSignalData = {
  signal: 'scarcity_promo',
  words: [
    { id: 'scarcity_promo.last_units', zh: '最后三单', en: 'last chance' },
    { id: 'scarcity_promo.livestream_push', zh: '直播间上链接', en: 'livestream push' },
  ],
};

function setLocale(locale: 'zh' | 'en') {
  (globalThis as unknown as { __testLocale?: 'zh' | 'en' }).__testLocale = locale;
}

beforeEach(() => {
  window.sessionStorage.clear();
  setLocale('zh');
});

afterEach(cleanup);

describe('ContextSignalChips', () => {
  it('渲染信号词 chips (zh 展示词), 零数字', () => {
    render(<ContextSignalChips data={DATA} />);
    expect(screen.getByTestId('context-signal-chips')).toBeTruthy();
    expect(screen.getByText('小象听到的信号')).toBeTruthy();
    expect(screen.getByText('最后三单')).toBeTruthy();
    expect(screen.getByText('直播间上链接')).toBeTruthy();
    expect(screen.getByTestId('context-signal-chips').textContent).not.toMatch(/[0-9]/);
  });

  it('en locale 取 en 展示词 (双语)', () => {
    setLocale('en');
    render(<ContextSignalChips data={DATA} />);
    expect(screen.getByText('last chance')).toBeTruthy();
    expect(screen.getByText('livestream push')).toBeTruthy();
  });

  it('点 ✕ = 纠正: 写 sessionStorage + 隐藏该 chip', () => {
    render(<ContextSignalChips data={DATA} />);
    fireEvent.click(screen.getByTestId('context-signal-dismiss-scarcity_promo.last_units'));
    expect(readDismissedContextSignals()).toEqual(['scarcity_promo.last_units']);
    expect(screen.queryByText('最后三单')).toBeNull();
    expect(screen.getByText('直播间上链接')).toBeTruthy();
  });

  it('全部纠正后显示收到的话, 不再展示 chips', () => {
    render(<ContextSignalChips data={DATA} />);
    fireEvent.click(screen.getByTestId('context-signal-dismiss-scarcity_promo.last_units'));
    fireEvent.click(screen.getByTestId('context-signal-dismiss-scarcity_promo.livestream_push'));
    expect(screen.queryByTestId('context-signal-chips')).toBeNull();
    expect(screen.getByTestId('context-signal-corrected').textContent).toContain('不按这个理解');
  });

  it('已纠正词条重挂载不复活 (storage 会话级生效)', () => {
    dismissContextSignal('scarcity_promo.last_units');
    render(<ContextSignalChips data={DATA} />);
    expect(screen.queryByText('最后三单')).toBeNull();
    expect(screen.getByText('直播间上链接')).toBeTruthy();
  });
});
