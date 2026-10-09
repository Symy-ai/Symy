// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const stableT = (key: string, values?: Record<string, string | number>) => {
  calls.push(key);
  if (key === 'common.minutesAgo') return `${values?.n} 分钟前`;
  if (key === 'common.hoursAgo') return `${values?.n} 小时前`;
  if (key === 'common.daysAgo') return `${values?.n} 天前`;
  if (key === 'common.justNow') return '刚刚';
  return key; // 未知 key 原样返回 (BadgeChip fallback 依赖此行为)
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import {
  BADGE_INFO,
  BadgeChip,
  BatteryIcon,
  HEALTH_CONFIG,
  HEALTH_EVENT_ICONS,
  formatTimeAgo,
} from '../constants';

/**
 * constants.tsx (184行) — Buddy 常量+helper (Round 82 拆分)。
 *
 * 锁定:
 * - HEALTH_EVENT_ICONS 十事件+HEALTH_CONFIG 五态全配 (batch3-b 绿色系)
 * - BatteryIcon 五态图标 (memo)
 * - BadgeChip: 已知徽章+未知 fallback 人类可读 (Bug C)
 * - formatTimeAgo 四档
 */
describe('buddy constants', () => {
  beforeEach(() => calls.length = 0);
  afterEach(() => cleanup());

  it('HEALTH_EVENT_ICONS 十事件+labelKey 别名表 (实测白名单)', () => {
    const ALIAS: Record<string, string> = {
      challenge_reward: 'challenge_won',
      passive_recovery: 'daily_recovery',
      drain: 'natural_drain',
      revive: 'revived',
      manual_adjustment: 'adjustment',
    };
    const keys = Object.keys(HEALTH_EVENT_ICONS);
    expect(keys).toHaveLength(10);
    for (const k of keys) {
      const seg = ALIAS[k] ?? k;
      expect(HEALTH_EVENT_ICONS[k].labelKey).toBe(`buddy.healthEventTypes.${seg}`);
      expect(HEALTH_EVENT_ICONS[k].icon).toBeTruthy();
    }
  });

  it('HEALTH_CONFIG 五态×十字段全配', () => {
    expect(Object.keys(HEALTH_CONFIG)).toHaveLength(5);
    for (const state of ['thriving', 'healthy', 'weak', 'critical', 'dormant'] as const) {
      const cfg = HEALTH_CONFIG[state];
      expect(Object.keys(cfg)).toHaveLength(10); // color/glow/bg/emoji/text/ring/particle/eye/body/neon
      expect(cfg.statusEmoji).toBeTruthy();
    }
    expect(HEALTH_CONFIG.thriving.statusEmoji).toBe('✨');
    expect(HEALTH_CONFIG.dormant.statusEmoji).toBe('💀');
  });

  it('BatteryIcon 五态渲染 (memo 对象)', () => {
    for (const h of ['thriving', 'healthy', 'weak', 'critical', 'dormant'] as const) {
      const { container } = render(<BatteryIcon health={h} />);
      expect(container.querySelector('svg')).toBeTruthy();
      cleanup();
    }
  });

  it('BadgeChip: 已知徽章 emoji+label; 未知 fallback 人类可读 (Bug C)', () => {
    render(<BadgeChip badge="streak_7" />);
    expect(screen.getByText('🍃')).toBeTruthy();
    expect(screen.getByText('Streak 7')).toBeTruthy(); // mock t 原样返回 key → fallback 人类可读 (Bug C 双向)
    cleanup();
    // 未知 badge: t 返回 key 原样 → 触发 fallback 转人类可读
    render(<BadgeChip badge="custom_new_badge" />);
    expect(screen.getByText('Custom New Badge')).toBeTruthy();
    expect(screen.getByText('🏆')).toBeTruthy(); // 灰色兜底 emoji
  });

  it('BADGE_INFO 十五徽章 (batch3-c 绿色荣誉库)', () => {
    expect(Object.keys(BADGE_INFO)).toHaveLength(15);
    expect(BADGE_INFO.light_bearer.emoji).toBe('🕯️'); // batch3-c 补注册锚
  });

  it('formatTimeAgo 四档', () => {
    const now = new Date();
    expect(formatTimeAgo(new Date(now.getTime() - 30_000), stableT)).toBe('刚刚');
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 60_000), stableT)).toBe('5 分钟前');
    expect(formatTimeAgo(new Date(now.getTime() - 3 * 3600_000), stableT)).toBe('3 小时前');
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 86400_000), stableT)).toBe('5 天前');
    expect(formatTimeAgo(new Date(now.getTime() - 30 * 86400_000), stableT)).toMatch(/\d{4}/); // 超周 → 日期
  });
});
