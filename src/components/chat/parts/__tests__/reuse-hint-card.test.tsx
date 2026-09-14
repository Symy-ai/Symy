// @vitest-environment happy-dom

/**
 * ReuseHintCard 渲染测试 — 标题/类目徽章/建议列表/省小时数/荣誉注脚,
 * 以及绿色守护开关关闭 → 整卡静默 (guard-off 同纪律)。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReuseHintCard } from '../reuse-hint-card';
import type { ReuseHint } from '@/lib/reuse-advisor';
import { _resetGreenPrefStateForTest } from '@/hooks/use-green-pref';
import { _resetReuseAdoptionForTest } from '@/components/chat-parts/reuse-adoption';
import { setGuardIntensity } from '@/hooks/use-guard-intensity';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn().mockResolvedValue({ success: true }),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => ({
      'chat.reuseHint.title': '🔁 先看看已有的',
      'chat.reuseHint.honestNote': '你在做对的事。',
      'chat.reuseHint.adoptButton': '我借到了 / 用上了已有的',
      'chat.reuseHint.adoptedNote': '已记录你的复用选择',
    })[key] ?? opts?.defaultValue ?? key,
  }),
}));

const hint: ReuseHint = {
  shouldSuggestReuse: true,
  category: 'tool_rental',
  categoryLabel: '工具·设备',
  suggestions: [
    '这类一年用不上几次的装备，租一次通常只要一杯奶茶钱。',
    '租来的用完就还，不用腾地方收纳。',
  ],
  reuseHonestNote: '你在做对的事——源头少买一件。',
  hoursLabel: '约省 3.8 小时自由时间',
};

describe('ReuseHintCard', () => {
  beforeEach(() => {
    _resetGreenPrefStateForTest();
    _resetReuseAdoptionForTest();
    vi.mocked(apiFetch).mockClear();
    localStorage.clear();
  });

  it('渲染标题 + 类目徽章 + 建议列表 + 省小时数 + 荣誉注脚', () => {
    render(<ReuseHintCard hint={hint} />);
    expect(screen.getByTestId('reuse-hint-card')).toBeTruthy();
    expect(screen.getByText('🔁 先看看已有的')).toBeTruthy();
    expect(screen.getByText('工具·设备')).toBeTruthy();
    expect(screen.getByText('这类一年用不上几次的装备，租一次通常只要一杯奶茶钱。')).toBeTruthy();
    expect(screen.getByText('约省 3.8 小时自由时间')).toBeTruthy();
    expect(screen.getByText('你在做对的事——源头少买一件。')).toBeTruthy();
    // 红线: 不跳转 — 卡内无链接
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('绿色守护关闭 → 整卡静默 (不渲染)', () => {
    localStorage.setItem('symy-green-pref', 'off');
    const { container } = render(<ReuseHintCard hint={hint} />);
    expect(container.querySelector('[data-testid="reuse-hint-card"]')).toBeNull();
  });

  it('payload 缺 hoursLabel/reuseHonestNote 时回落 i18n 注脚, 不崩', () => {
    render(
      <ReuseHintCard
        hint={{ ...hint, hoursLabel: undefined, reuseHonestNote: undefined }}
      />,
    );
    expect(screen.getByTestId('reuse-hint-card')).toBeTruthy();
    expect(screen.queryByText('约省 3.8 小时自由时间')).toBeNull();
    expect(screen.getByText('你在做对的事。')).toBeTruthy();
  });

  it('batch56-c 采纳按钮: 点击 → POST /api/reuse/adoption → 进已确认态 (一次)', async () => {
    render(<ReuseHintCard hint={hint} />);
    fireEvent.click(screen.getByTestId('reuse-adopt-button'));
    await waitFor(() => {
      expect(screen.getByTestId('reuse-adopted-note')).toBeTruthy();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/reuse/adoption', {
      method: 'POST',
      body: { categoryId: 'tool_rental', estSaved: undefined },
    });
  });

  it('batch56-c gentle 档: 采纳行整体隐藏', async () => {
    setGuardIntensity('gentle');
    render(<ReuseHintCard hint={hint} />);
    await waitFor(() => {
      expect(screen.queryByTestId('reuse-adopt-button')).toBeNull();
      expect(screen.queryByTestId('reuse-adopted-note')).toBeNull();
    });
    setGuardIntensity('balanced');
  });
});
