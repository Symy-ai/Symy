// @vitest-environment happy-dom
/**
 * GuardianStyleContractCard 直测 (batch78-a)
 *
 * 契约卡荣誉面: 身份句 + 时段/次数/品类计数承诺, 结构性不含金额与百分比
 * (字典层零金额红线由 guardian-style-i18n-guard 锁死, 本文件在组件层复锁)。
 * 本文件锁: 四个 li 的 key 映射随 plan 逐维切换、{range}/{count} 插值接线、
 * scope 行三选一优先级 (strict > exempt > all)、全组合零崩溃 + 零货币符号。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GuardianStyleContractCard } from '../guardian-style-contract-card';
import { CONTRACT_IDENTITY_KEY, CONTRACT_NIGHT_KEY, CONTRACT_PUSH_KEY } from '../guardian-style-copy';
import { defaultGuardScope, GUARD_SCOPE_CATEGORIES } from '@/lib/guard-scope';
import { GUARD_INTENSITIES, type GuardIntensity } from '@/lib/guard-intensity';
import { NIGHT_WINDOW_OPTIONS, NIGHT_WINDOW_PRESETS } from '@/lib/night-window';
import { PUSH_FREQUENCIES, type PushFrequency } from '@/lib/push/preferences';
import type { GuardianStylePlan } from '@/lib/guardian-style';

// 契约卡只经由传入的 t 取词 — 用模板表验证 key 映射与插值接线
const TEMPLATES: Record<string, string> = {
  'profile.guardianStyleContractScopeStrict': '{count} categories strict',
  'profile.guardianStyleContractScopeExempt': '{count} categories exempt',
  'profile.guardianStyleContractScopeAllGuard': 'all categories guarded',
  'profile.guardianStyleContractNightOn': 'night guard on {range}',
  'profile.guardianStyleContractNightOff': 'night guard off',
};
const t = (key: string, params?: Record<string, string | number>) => {
  let result = TEMPLATES[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) result = result.replaceAll(`{${k}}`, String(v));
  }
  return result;
};

function plan(overrides: Partial<GuardianStylePlan> = {}): GuardianStylePlan {
  return {
    guardIntensity: 'balanced',
    nightWindow: 'standard',
    pushFrequency: 'daily',
    guardScope: defaultGuardScope(),
    ...overrides,
  };
}

function renderCard(p: GuardianStylePlan) {
  return render(<GuardianStyleContractCard plan={p} t={t} />);
}

afterEach(cleanup);

describe('GuardianStyleContractCard 契约行映射', () => {
  it('身份句随 guardIntensity 三档切换', () => {
    for (const intensity of GUARD_INTENSITIES) {
      renderCard(plan({ guardIntensity: intensity }));
      expect(screen.getByTestId('guardian-style-contract-identity').textContent).toBe(
        CONTRACT_IDENTITY_KEY[intensity]
      );
      cleanup();
    }
  });

  it('提醒节奏随 pushFrequency 三档切换', () => {
    for (const freq of PUSH_FREQUENCIES as readonly PushFrequency[]) {
      renderCard(plan({ pushFrequency: freq }));
      expect(screen.getByTestId('guardian-style-contract-push').textContent).toBe(
        CONTRACT_PUSH_KEY[freq]
      );
      cleanup();
    }
  });

  it('夜间时段: 开启档插值 {range} 取自 NIGHT_WINDOW_OPTIONS, off 单独句', () => {
    for (const preset of NIGHT_WINDOW_PRESETS) {
      renderCard(plan({ nightWindow: preset }));
      const line = screen.getByTestId('guardian-style-contract-night').textContent ?? '';
      expect(line).toBe(t(CONTRACT_NIGHT_KEY[preset], { range: NIGHT_WINDOW_OPTIONS[preset].rangeLabel }));
      if (preset === 'off') {
        expect(line).toBe('night guard off');
      } else {
        expect(line).toBe(`night guard on ${NIGHT_WINDOW_OPTIONS[preset].rangeLabel}`);
      }
      cleanup();
    }
  });
});

describe('GuardianStyleContractCard scope 行三选一', () => {
  it('全 guard → AllGuard 句', () => {
    renderCard(plan());
    expect(screen.getByTestId('guardian-style-contract-scope').textContent).toBe(
      'all categories guarded'
    );
  });

  it('有 strict → strict 优先于 exempt', () => {
    const scope = { ...defaultGuardScope(), electronics: 'strict', food: 'exempt' } as ReturnType<typeof defaultGuardScope>;
    renderCard(plan({ guardScope: scope }));
    expect(screen.getByTestId('guardian-style-contract-scope').textContent).toBe(
      '1 categories strict'
    );
  });

  it('仅 exempt → Exempt 句并计数', () => {
    const scope = { ...defaultGuardScope(), beauty: 'exempt', home: 'exempt' } as ReturnType<typeof defaultGuardScope>;
    renderCard(plan({ guardScope: scope }));
    expect(screen.getByTestId('guardian-style-contract-scope').textContent).toBe(
      '2 categories exempt'
    );
  });

  it('计数覆盖全部五品类', () => {
    const scope = {
      ...defaultGuardScope(),
      ...Object.fromEntries(GUARD_SCOPE_CATEGORIES.map((c) => [c, 'strict'])),
    } as ReturnType<typeof defaultGuardScope>;
    renderCard(plan({ guardScope: scope }));
    expect(screen.getByTestId('guardian-style-contract-scope').textContent).toBe(
      '5 categories strict'
    );
  });
});

describe('GuardianStyleContractCard 全组合红线', () => {
  it('3 强度 × 4 时段 × 3 节奏 = 36 组合: 四行齐备、零崩溃、零货币符号零百分比', () => {
    for (const intensity of GUARD_INTENSITIES as readonly GuardIntensity[]) {
      for (const nightWindow of NIGHT_WINDOW_PRESETS) {
        for (const pushFrequency of PUSH_FREQUENCIES as readonly PushFrequency[]) {
          const { container } = renderCard(plan({ guardIntensity: intensity, nightWindow, pushFrequency }));
          expect(screen.getByTestId('guardian-style-contract-card')).toBeTruthy();
          expect(screen.getByTestId('guardian-style-contract-identity')).toBeTruthy();
          expect(screen.getByTestId('guardian-style-contract-night')).toBeTruthy();
          expect(screen.getByTestId('guardian-style-contract-push')).toBeTruthy();
          expect(screen.getByTestId('guardian-style-contract-scope')).toBeTruthy();
          expect(container.textContent).not.toMatch(/[$¥€]|%/);
          cleanup();
        }
      }
    }
  });
});
