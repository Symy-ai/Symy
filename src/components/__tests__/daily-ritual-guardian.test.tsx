/**
 * Guardian narrative guards for DailyRitualOverlay + 文案库 (batch6-c)
 *
 * 仪式从魔镜自由叙事换成绿色守护叙事 — 这组测试防走回头路:
 *   - 文案库: 无 mirror/freedom/自由 等旧叙事词 (内容审计), 条目数 ≥ 8
 *   - 轮换: 一整年 sweep 覆盖全部条目; 仪式 N 与主页 N+1 同日不重复
 *   - 组件: 守护天数用 streakDays prop 原样展示 (0/缺省 → 第 1 天, 不出 0)
 *   - 组件: 金额行 = 守护口径一行小字; 无自由小时/月数叙事
 *   - 设计原则守卫: 全屏恰好一个按钮, 无 Skip/任务/推荐话术
 *   - 持久化: 关闭时 auth → POST ritual-status; demo → localStorage 写窗口 key (行为 diff 为零)
 *   - i18n: ritual.* 双语齐全、每个 key 都被组件引用 (无死 key); 旧叙事 key 保持删除
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DailyRitualOverlay } from '../daily-ritual-overlay';
import {
  DAILY_GUARDIAN_LINES,
  getDailyGuardianIndex,
  getRitualGuardianLine,
  getTodayGuardianLine,
} from '@/lib/daily-reflections';
import { getLimitWindow } from '@/lib/limit-window';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

// Mock i18n — 直接读真实 en.json, 保证断言与线上文案一致
vi.mock('@/i18n/provider', async () => {
  const messages = await import('@/i18n/messages/en.json');
  const table = messages.default as Record<string, unknown>;
  const lookup = (key: string): string | undefined =>
    key.split('.').reduce<unknown>((node, seg) => (node && typeof node === 'object' ? (node as Record<string, string>)[seg] : undefined), table) as string | undefined;
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
        const { defaultValue, ...vars } = params || {};
        let result = lookup(key) ?? defaultValue ?? key;
        for (const [k, v] of Object.entries(vars)) {
          result = result.replace(`{${k}}`, String(v));
        }
        return result;
      },
      locale: 'en',
    }),
  };
});

const SRC = join(process.cwd(), 'src');
const ritualStatus = { shouldShow: true, lastRitualAt: null, intervalMs: 86_400_000 };

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue(ritualStatus);
  localStorage.clear();
});

// ============ 文案库内容守卫 ============

describe('daily guardian line library', () => {
  const OLD_NARRATIVE = /mirror|reflect|freedom|魔镜|镜子|照见|自由/i;

  it('carries zero old mirror/freedom narrative words (en + zh)', () => {
    for (const [i, line] of DAILY_GUARDIAN_LINES.entries()) {
      expect(line.en, `en#${i}`).not.toMatch(OLD_NARRATIVE);
      expect(line.zh, `zh#${i}`).not.toMatch(OLD_NARRATIVE);
    }
  });

  it('stays at least as large as the old 8-entry library, both locales non-empty', () => {
    expect(DAILY_GUARDIAN_LINES.length).toBeGreaterThanOrEqual(8);
    for (const [i, line] of DAILY_GUARDIAN_LINES.entries()) {
      expect(line.en.trim().length, `en#${i}`).toBeGreaterThan(0);
      expect(line.zh.trim().length, `zh#${i}`).toBeGreaterThan(0);
    }
  });

  it('rotates through every entry across a full year; ritual N ≠ home N+1', () => {
    const seen = new Set<number>();
    for (let day = 1; day <= 365; day++) {
      seen.add(getDailyGuardianIndex(new Date(Date.UTC(2026, 0, day))));
    }
    expect(seen.size).toBe(DAILY_GUARDIAN_LINES.length);

    const date = new Date(Date.UTC(2026, 5, 15));
    expect(getTodayGuardianLine(date)).not.toBe(getRitualGuardianLine(date));
  });
});

// ============ 组件叙事守卫 ============

describe('DailyRitualOverlay guardian narrative', () => {
  it('shows guardian day from the streakDays prop and one in-app money line', async () => {
    render(<DailyRitualOverlay userName="Spark" totalSaved={1366} streakDays={7} />);

    expect(await screen.findByText(/Day 7/)).toBeTruthy();
    expect(await screen.findByText(/Guarding has let you keep/)).toBeTruthy();
    expect(screen.getByText(/Guarding has let you keep/).textContent).toContain('$1,366');
    // 旧自由叙事清零: 无自由小时/月数/"夺回生命"话术
    expect(document.body.textContent).not.toMatch(/freedom|months|of your life|impulse/i);
  });

  it('renders streak 0 / missing as day 1 — new journey framing, never 0', async () => {
    const { unmount } = render(<DailyRitualOverlay totalSaved={0} streakDays={0} />);
    expect(await screen.findByText(/Day 1/)).toBeTruthy();
    unmount();

    render(<DailyRitualOverlay totalSaved={0} />);
    expect(await screen.findByText(/Day 1/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Day 0/);
  });

  it('keeps ritual form: exactly one button, no skip/task/recommendation affordances', async () => {
    render(<DailyRitualOverlay userName="Spark" totalSaved={100} streakDays={3} />);
    await screen.findByText(/Day 3/);

    const buttons = document.body.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/skip|task|recommended|跳过|任务|推荐/i);
  });

  it('closing marks ritual shown — auth path POSTs ritual-status once', async () => {
    render(<DailyRitualOverlay userName="Spark" totalSaved={100} streakDays={3} />);
    await screen.findByText(/Day 3/);

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(document.querySelector('button')!);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/user/ritual-status', { method: 'POST' }),
    );
  });

  it('demo path shows via localStorage window and writes the window key on close', async () => {
    render(<DailyRitualOverlay totalSaved={100} streakDays={2} isDemo />);
    await screen.findByText(/Day 2/);
    expect(apiFetchMock).not.toHaveBeenCalled();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(document.querySelector('button')!);

    await waitFor(() => expect(localStorage.getItem('symy-daily-ritual')).toBe(getLimitWindow()));
  });
});

// ============ i18n + 接线守卫 ============

describe('ritual i18n keys', () => {
  const RETIRED_KEYS = ['youHaveNow', 'notWorking', 'hoursFree', 'savedAmount', 'monthsFree', 'thisIsDays', 'iSeeButton'];

  it('keeps ritual.* bilingual and symmetric', () => {
    const enRitual = en.ritual as Record<string, string>;
    const zhRitual = zh.ritual as Record<string, string>;
    expect(Object.keys(enRitual).sort()).toEqual(Object.keys(zhRitual).sort());
    for (const [key, value] of Object.entries(enRitual)) {
      expect(zhRitual[key], `zh ritual.${key}`).toBeTruthy();
      expect(value, `en ritual.${key}`).not.toMatch(/mirror|freedom|自由|照见/i);
      expect(zhRitual[key], `zh ritual.${key}`).not.toMatch(/mirror|freedom|自由|照见/);
    }
  });

  it('has no dead keys — every key is referenced in the component', () => {
    const source = readFileSync(join(SRC, 'components/daily-ritual-overlay.tsx'), 'utf-8');
    // greeting keys 由模板字符串动态拼出, 单独放行
    const dynamic = new Set(['greetingMorning', 'greetingAfternoon', 'greetingEvening', 'greetingNight']);
    for (const key of Object.keys(en.ritual as Record<string, string>)) {
      if (dynamic.has(key)) {
        expect(source).toContain('ritual.greeting${');
        continue;
      }
      expect(source, `ritual.${key}`).toContain(`ritual.${key}`);
    }
  });

  it('keeps retired mirror-narrative keys deleted', () => {
    const enRitual = en.ritual as Record<string, string>;
    const zhRitual = zh.ritual as Record<string, string>;
    for (const key of RETIRED_KEYS) {
      expect(enRitual).not.toHaveProperty(key);
      expect(zhRitual).not.toHaveProperty(key);
    }
    expect(en).not.toHaveProperty('dailyRitual');
    expect(zh).not.toHaveProperty('dailyRitual');
  });

  it('wires the guardian day to the shared streak source in page.tsx', () => {
    const page = readFileSync(join(SRC, 'app/[locale]/page.tsx'), 'utf-8');
    expect(page).toContain('streakDays={stats.daysStreak}');
  });
});
