/**
 * Component tests for InducementStrategies — 数据源角标 (batch81-b)
 *
 * 诚实原则: source='sample' (服务端样本 <20 或 API 失败走 mock) 时,
 * 登录用户也必须看到 Sample 角标; source='real' 不标。
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InducementStrategies } from '../components/inducement-strategies';
import type { InducementStrategy } from '../hooks/use-community-stats';
import type { useI18n } from '@/i18n/provider';

const TRANSLATIONS: Record<string, string> = {
  'inward.topStrategies': '⚡ Top Inducement Tactics',
  'defense.topStrategiesDesc': 'Most common spending traps this week',
  'defense.sampleDataBadge': '📋 样本数据 — 真实洞察积累中',
  'defense.sampleDataDemo': 'Sample data — yours will be real when you sign up',
  'defense.strategyLimitedTime': 'Limited-time countdown',
  'defense.strategyBnpl': 'BNPL "4 interest-free payments"',
};

const t = ((key: string, values?: Record<string, unknown>) => {
  let text = TRANSLATIONS[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}) as unknown as ReturnType<typeof useI18n>['t'];

const sampleStrategies: InducementStrategy[] = [
  { strategy: 'limited_time', labelKey: 'defense.strategyLimitedTime', defaultLabel: 'Limited-time countdown', percentage: 80 },
  { strategy: 'bnpl', labelKey: 'defense.strategyBnpl', defaultLabel: 'BNPL "4 interest-free payments"', percentage: 20 },
];

function renderStrategies(props: Partial<Parameters<typeof InducementStrategies>[0]> = {}) {
  return render(
    <InducementStrategies
      strategies={sampleStrategies}
      isLoading={false}
      t={t}
      {...props}
    />,
  );
}

describe('InducementStrategies — 数据源角标', () => {
  it('shows the sample badge for logged-in users when source=sample', () => {
    renderStrategies({ source: 'sample' });
    expect(screen.getByText('📋 样本数据 — 真实洞察积累中')).toBeTruthy();
    expect(screen.getByText('Limited-time countdown')).toBeTruthy();
  });

  it('shows no badge when source=real', () => {
    renderStrategies({ source: 'real' });
    expect(screen.queryByText(/样本数据/)).toBeNull();
    expect(screen.queryByText(/Sample data/)).toBeNull();
  });

  it('keeps the demo sign-up line in demo mode instead of the logged-in badge', () => {
    renderStrategies({ isDemo: true, source: 'sample' });
    expect(screen.getByText('Sample data — yours will be real when you sign up')).toBeTruthy();
    expect(screen.queryByText(/样本数据/)).toBeNull();
  });

  it('defaults to source=real when the prop is absent (向后兼容旧调用)', () => {
    renderStrategies();
    expect(screen.queryByText(/Sample data/)).toBeNull();
  });

  it('renders nothing while loading', () => {
    const { container } = renderStrategies({ isLoading: true, source: 'sample' });
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the strategy list is empty', () => {
    const { container } = renderStrategies({ strategies: [], source: 'sample' });
    expect(container.textContent).toBe('');
  });
});
