// @vitest-environment happy-dom
// FreedomPreview — 自由预览卡（此前 0 测试）
// 三维度: 生命时间(amount/时薪)/未来值(7%年化20年)/基金进度
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, rateIsDefault: true, setHourlyRate: vi.fn() }),
}));

import { FreedomPreview } from '../freedom-preview';

describe('FreedomPreview — 三维度实时预览', () => {
  it('金额 $100 / 时薪 25 → 4 小时 (生命时间换算)', () => {
    render(<FreedomPreview amount={100} />);
    expect(screen.getAllByText(/4(\.0)? 小时/).length).toBeGreaterThan(0);
  });

  it('小金额 <1h 显示分钟 (amount 10 → 24 分钟)', () => {
    render(<FreedomPreview amount={10} />);
    expect(screen.getAllByText(/24 分钟/).length).toBeGreaterThan(0);
  });

  it('未来值: $100 × 1.07^20 ≈ $387 (7% 20年)', () => {
    const { container } = render(<FreedomPreview amount={100} />);
    expect(container.textContent).toMatch(/\$38[0-9]/);
  });

  it('大额未来值走 k 格式 ($10k+)', () => {
    const { container } = render(<FreedomPreview amount={5000} />);
    expect(container.textContent).toMatch(/\$1[0-9]k|\$20k/); // 5000×3.87≈19k
  });

  it('空 dreamFunds → 跳过基金维度不炸', () => {
    expect(() => render(<FreedomPreview amount={100} dreamFunds={[]} />)).not.toThrow();
  });

  it('带 itemName → closing question 含物品名', () => {
    const { container } = render(<FreedomPreview amount={100} itemName="空气炸锅" />);
    // closing question 由 i18n defaultValue 兜底渲染（mock 直通 key）
    expect(container.textContent).toContain('空气炸锅');
  });
});
