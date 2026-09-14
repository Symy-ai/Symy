// @vitest-environment happy-dom

/**
 * batch21-b: Home「本周守护挑战」卡守卫
 *
 * 覆盖:
 *  - 无活跃挑战态: 挑战名 + 「开始守护」CTA, 点击触发 onStart (zh/en 各一遍, 无红色警急色)
 *  - 进行中态: item_name + 正在守护金额 + 自由小时换算行 (官方 moneyToFreedomLabel 真函数核对)
 *  - active=undefined 静默: 整卡不渲染, 零错误文案 (挑战入口绝不让主屏挂错误角标)
 *  - i18n: home.weeklyChallenge.* zh/en 键对称 + 组件引用的每个键双侧存在 (无孤儿)
 *  - greenPref off 时卡片仍显示 — 挑战入口是产品核心, 非绿色装饰 (与商品卡静默语义相反)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';
import { WeeklyChallengeCard, type ActiveChallengeSnapshot } from '../weekly-challenge-card';
import {
  pickWeeklyFeatureChallenge,
  CHALLENGE_TIER_LABEL_KEYS,
} from '../../buddy/challenge-definitions';
import { moneyToFreedomLabel } from '@/lib/freedom-time';

// i18n 桩 — 真实 zh/en 文案喂 t() (守卫防的是真实文案回退), 支持 {param} 插值
const i18nState = vi.hoisted(() => ({
  dict: {} as Record<string, string>,
  locale: 'zh' as string,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: i18nState.locale,
    t: (key: string, values?: Record<string, string | number>) => {
      let out = i18nState.dict[key] ?? key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          out = out.split(`{${k}}`).join(String(v));
        }
      }
      return out;
    },
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, setHourlyRate: vi.fn() }),
}));

// greenPref off 桩 — 若组件未来引入 useGreenPref 门控, 本文件「off 仍显示」用例即红
vi.mock('@/hooks/use-green-pref', () => ({
  useGreenPref: () => ({ greenPrefEnabled: false, setGreenPrefEnabled: vi.fn() }),
}));

function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = String(node ?? '');
  }
  return out;
}

function setMessages(messages: typeof zh | typeof en, locale: string) {
  i18nState.dict = flatten(messages);
  i18nState.locale = locale;
}

// 周轮换确定性: 同测试进程内 TZ=UTC (setup.ts 强制), 本周全端同一条
const weekly = pickWeeklyFeatureChallenge();
const ACTIVE: ActiveChallengeSnapshot = { id: 'ch-1', item_name: 'Sneaker Pro', amount: 50 };

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('weekly challenge card (batch21-b)', () => {
  it('无活跃挑战态: 渲染挑战名+「开始守护」CTA, 点击触发 onStart(weekly) — zh+en, 荣誉框架无红色', () => {
    for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
      setMessages(messages, locale);
      const onStart = vi.fn();
      const { container, getByTestId, getByText, unmount } = render(
        <WeeklyChallengeCard weekly={weekly} active={null} onStart={onStart} />,
      );

      expect(getByTestId('weekly-challenge-card')).toBeTruthy();
      // 挑战名 + 守护叙事 (titleKey/descKey 双侧 JSON 真文案)
      expect(getByText(i18nState.dict[weekly.titleKey])).toBeTruthy();
      expect(getByText(i18nState.dict[weekly.descKey])).toBeTruthy();

      const cta = getByText(i18nState.dict['home.weeklyChallenge.cta']);
      fireEvent.click(cta);
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(weekly);

      // 荣誉框架红线: 禁红色/警急色
      expect(container.innerHTML).not.toMatch(/text-red-\d|border-red-\d|bg-red-\d|rose-\d/);
      unmount();
    }
  });

  it('进行中态: item_name + 正在守护金额 + 自由小时换算行 (zh+en)', () => {
    for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
      setMessages(messages, locale);
      const onStart = vi.fn();
      const { getByTestId, getByText, unmount } = render(
        <WeeklyChallengeCard weekly={weekly} active={ACTIVE} onStart={onStart} />,
      );

      expect(getByText('Sneaker Pro')).toBeTruthy();
      expect(getByText(i18nState.dict['home.weeklyChallenge.activeTitle'])).toBeTruthy();
      expect(getByText(i18nState.dict['home.weeklyChallenge.activeMoneyLeft'])).toBeTruthy();

      // 里子行: 挑战管道真实金额, 不发明新记账口径
      expect(getByTestId('weekly-challenge-amount').textContent).toBe('$50.00');

      // 官方换算真函数核对: $50 / $25 时薪 = 2h
      const expectedFreedom = moneyToFreedomLabel(ACTIVE.amount, locale, 25);
      expect(getByTestId('weekly-challenge-freedom').textContent).toBe(
        i18nState.dict['home.weeklyChallenge.freedomHint'].replace('{time}', expectedFreedom),
      );

      const goTo = getByText(i18nState.dict['home.weeklyChallenge.activeGoTo']);
      fireEvent.click(goTo);
      expect(onStart).toHaveBeenCalledWith(weekly);
      unmount();
    }
  });

  it('active=undefined 静默: 整卡不渲染, 零错误文案', () => {
    setMessages(zh, 'zh');
    const { container } = render(
      <WeeklyChallengeCard weekly={weekly} active={undefined} onStart={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="weekly-challenge-card"]')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.textContent).not.toContain('守护管道');
  });

  it('i18n: home.weeklyChallenge.* zh/en 键对称, 组件引用的每个键双侧存在 (无孤儿)', () => {
    const zhFlat = flatten(zh);
    const enFlat = flatten(en);
    const zhKeys = Object.keys(zhFlat).filter((k) => k.startsWith('home.weeklyChallenge.'));
    const enKeys = Object.keys(enFlat).filter((k) => k.startsWith('home.weeklyChallenge.'));
    expect(zhKeys.sort()).toEqual(enKeys.sort());
    expect(zhKeys.length).toBeGreaterThanOrEqual(6);

    // 组件源码里 t('...') 字面量键 + 动态键 (titleKey/descKey/tierKey) 全部双侧存在
    const src = readFileSync(join(__dirname, '../weekly-challenge-card.tsx'), 'utf-8');
    const literalKeys = [...src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    const dynamicKeys = [
      weekly.titleKey,
      weekly.descKey,
      ...Object.values(CHALLENGE_TIER_LABEL_KEYS),
    ];
    for (const key of [...literalKeys, ...dynamicKeys]) {
      expect(zhFlat[key], `zh 缺键: ${key}`).toBeTruthy();
      expect(enFlat[key], `en 缺键: ${key}`).toBeTruthy();
    }
  });

  it('greenPref off 时卡片仍显示 — 挑战入口是产品核心, 非绿色装饰', () => {
    setMessages(zh, 'zh');
    // 顶部 useGreenPref 已 mock 为 greenPrefEnabled: false — 卡片两态都必须照常渲染
    const cta = render(<WeeklyChallengeCard weekly={weekly} active={null} onStart={vi.fn()} />);
    expect(cta.getByTestId('weekly-challenge-card')).toBeTruthy();
    cleanup();
    const active = render(<WeeklyChallengeCard weekly={weekly} active={ACTIVE} onStart={vi.fn()} />);
    expect(active.getByTestId('weekly-challenge-card')).toBeTruthy();
  });
});
