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

  it('小时格式边界: 250/25=10h 整数显示; 240/25=9.6h 一位小数', () => {
    const { container: c10 } = render(<FreedomPreview amount={250} />);
    expect(c10.textContent).toContain('10 小时');
    const { container: c96 } = render(<FreedomPreview amount={240} />);
    expect(c96.textContent).toContain('9.6 小时');
  });

  it('未来值大额走 M 档 ($1M+)', () => {
    const { container } = render(<FreedomPreview amount={1_000_000} />);
    // 1M × 3.87 ≈ 3.9M
    expect(container.textContent).toMatch(/\$3\.9M/);
  });

  it('基金进度: 第一个未达成基金 remaining/amount → 1/X 分母', () => {
    const { container } = render(
      <FreedomPreview
        amount={100}
        dreamFunds={[
          { id: 'f1', name: 'Emergency', emoji: '🚨', current: 1000, target: 1000 }, // 已达成跳过
          { id: 'f2', name: 'Japan Trip', emoji: '🗾', current: 300, target: 1000 }, // 剩 700 → 1/7
          { id: 'f3', name: 'Unused', emoji: '💤', current: 0, target: 5000 },
        ] as never}
      />,
    );
    expect(container.textContent).toContain('Japan Trip');
    expect(container.textContent).toMatch(/1\s*\/\s*7/);
  });

  it('role=status aria-live=polite (读屏实时播报)', () => {
    const { container } = render(<FreedomPreview amount={100} />);
    const el = container.querySelector('[role="status"]');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('closing question: 无 itemName → zh 回落「它」', () => {
    const { container } = render(<FreedomPreview amount={100} />);
    expect(container.textContent).toContain('你愿意用 4.0 小时 换它吗');
  });
});