// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DailyNeedsSection } from '../daily-needs-section';
import type { DailyNeeds } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> & { defaultValue?: string }) =>
      params?.defaultValue !== undefined ? String(params.defaultValue) : key,
    locale: 'en',
  }),
}));

vi.mock('@/lib/feature-flags', () => ({ GACHA_FEATURE_ENABLED: false }));

vi.mock('lucide-react', () => ({ X: () => <span data-testid="x-icon" /> }));

const needs = (clarity: number, connection: number): DailyNeeds => ({ clarity, connection });

describe('DailyNeedsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders both need bars with rounded percentages', () => {
    render(<DailyNeedsSection dailyNeeds={needs(72.4, 55.6)} />);
    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.getByText('56%')).toBeTruthy();
  });

  it('harmony: all needs >= 60 shows harmony badge', () => {
    render(<DailyNeedsSection dailyNeeds={needs(80, 65)} />);
    expect(screen.getByText('harmony')).toBeTruthy();
    expect(screen.queryByText('discomfort')).toBeNull();
  });

  it('discomfort: any need <= 30 shows discomfort badge + low hint', () => {
    render(<DailyNeedsSection dailyNeeds={needs(80, 25)} />);
    expect(screen.getByText('discomfort')).toBeTruthy();
    // GACHA_FEATURE_ENABLED=false → dailyNeedsLowHintNoGacha 分支
    expect(screen.getByText(/Symy 正在攒劲休息/)).toBeTruthy();
  });

  it('neutral: between thresholds shows neutral badge without low hint', () => {
    render(<DailyNeedsSection dailyNeeds={needs(50, 45)} />);
    expect(screen.getByText('neutral')).toBeTruthy();
    expect(screen.queryByText(/攒劲休息/)).toBeNull();
  });

  it('low need (<=30) gets amber text and pulse ring; healthy need does not', () => {
    const { container } = render(<DailyNeedsSection dailyNeeds={needs(25, 80)} />);
    // 低值条: ring-amber 类在轨道容器上
    const tracks = container.querySelectorAll('.h-2.rounded-full');
    expect(tracks[0].className).toContain('ring-1');
    expect(tracks[1].className).not.toContain('ring-1');
  });

  it('bar width maps value percentage', () => {
    const { container } = render(<DailyNeedsSection dailyNeeds={needs(40, 90)} />);
    const fills = container.querySelectorAll<HTMLDivElement>('.h-full.rounded-full');
    expect(fills[0].style.width).toBe('40%');
    expect(fills[1].style.width).toBe('90%');
  });

  it('hover shows hint text when hint exists (non-empty defaultValue path)', () => {
    // t() mock 返回 defaultValue — hint 的 defaultValue 是 '' → 不渲染 hint
    const { container } = render(<DailyNeedsSection dailyNeeds={needs(50, 50)} />);
    const row = container.querySelectorAll('.flex.items-center.gap-2')[0];
    fireEvent.mouseEnter(row as HTMLElement);
    // hint 为空串 → isHovered && hint 为 falsy → 无 hint 段
    expect(row.textContent).not.toContain('mt-0.5');
    fireEvent.mouseLeave(row as HTMLElement);
  });

  it('tooltip popover: ⓘ opens portal dialog, Got-it closes it', () => {
    render(<DailyNeedsSection dailyNeeds={needs(70, 70)} />);
    const infoButtons = screen.getAllByRole('button', { name: 'What does this mean?' });
    fireEvent.click(infoButtons[0]);
    // portal 弹层: 标题 + Got it 按钮
    expect(screen.getByText('Current level')).toBeTruthy();
    fireEvent.click(screen.getByText('Got it'));
    expect(screen.queryByText('Current level')).toBeNull();
  });

  it('tooltip closes on backdrop click', () => {
    render(<DailyNeedsSection dailyNeeds={needs(70, 70)} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'What does this mean?' })[0]);
    const backdrop = document.querySelector('.fixed.inset-0.z-\\[300\\]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(screen.queryByText('Current level')).toBeNull();
  });

  it('tooltip closes on Escape key', () => {
    render(<DailyNeedsSection dailyNeeds={needs(70, 70)} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'What does this mean?' })[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Current level')).toBeNull();
  });
});
