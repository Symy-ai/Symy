// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'inward.topStrategies': '常见消费陷阱',
    'defense.topStrategiesDesc': '本周 Symy 用户遇到的最常见消费陷阱',
    'defense.sampleDataDemo': '示例数据 — 注册后将是你的真实数据',
    'defense.sampleDataBadge': 'Sample data — 基于小样本统计',
    'strategy.limited_time': '限时促销',
    'strategy.bnpl': '先买后付',
    'strategy.other': '其他',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

import { InducementStrategies } from '../inducement-strategies';

const strategies = (n: number) => Array.from({ length: n }, (_, i) => ({
  strategy: i === 0 ? 'limited_time' : i === 1 ? 'bnpl' : 'other',
  labelKey: i === 0 ? 'strategy.limited_time' : i === 1 ? 'strategy.bnpl' : 'strategy.other',
  defaultLabel: 'Default',
  percentage: 40 - i * 3,
}));

/**
 * inducement-strategies.tsx (94行) — 诱导策略 Top 10 (Round 117 扩展件)。
 *
 * 锁定:
 * - loading/空 → null
 * - Top 10 裁剪; 前三奖牌+琥珀; 4+ 数字序号+红系
 * - 奖牌 emoji: 🥇🥈🥉; 图标映射 (⏰/💳); 未映射 → 🔹
 * - 诚实原则: isDemo → demo 标注; 登录+sample → Sample 角标; real 无角标
 */
describe('InducementStrategies Top 10', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('loading/空 → null', () => {
    const { container } = render(<InducementStrategies strategies={[]} isLoading t={stableT} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    render(<InducementStrategies strategies={strategies(3)} isLoading t={stableT} />);
    expect(document.querySelector('.px-4')).toBeNull();
  });

  it('Top 10 裁剪 + 前三奖牌/4+ 序号', () => {
    render(<InducementStrategies strategies={strategies(15)} isLoading={false} t={stableT} />);
    const rows = document.querySelectorAll('.space-y-2 > div');
    expect(rows.length).toBe(10); // 15 条裁到 10
    expect(screen.getByText('🥇')).toBeTruthy();
    expect(screen.getByText('🥈')).toBeTruthy();
    expect(screen.getByText('🥉')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy(); // 第 4 名数字序号
    expect(screen.getByText('10')).toBeTruthy(); // 第 10 名
  });

  it('前三琥珀+图标映射; 4+ 红系', () => {
    render(<InducementStrategies strategies={strategies(5)} isLoading={false} t={stableT} />);
    expect(screen.getByText('⏰')).toBeTruthy(); // limited_time
    expect(screen.getByText('💳')).toBeTruthy(); // bnpl
    const rows = document.querySelectorAll('.space-y-2 > div');
    expect((rows[0] as HTMLElement).className).toContain('bg-glass-fill/50');
    expect((rows[3] as HTMLElement).className).toContain('bg-red-500/5');
    expect(screen.getByText('40%').className).toContain('text-amber-400');
    expect(screen.getByText('28%').className).toContain('text-red-400');
  });

  it('诚实原则: isDemo → demo 标注; 登录+sample → Sample 角标; real 无角标', () => {
    render(<InducementStrategies strategies={strategies(3)} isLoading={false} t={stableT} isDemo />);
    expect(screen.getByText('示例数据 — 注册后将是你的真实数据')).toBeTruthy();
    cleanup(); // R235 规则: 段间隔离
    render(<InducementStrategies strategies={strategies(3)} isLoading={false} t={stableT} source="sample" />);
    expect(screen.getByText('Sample data — 基于小样本统计')).toBeTruthy();
    cleanup(); // R235 规则: 段间隔离
    render(<InducementStrategies strategies={strategies(3)} isLoading={false} t={stableT} source="real" />);
    expect(screen.queryByText(/Sample data/)).toBeNull(); // 真数据无角标
  });
});
