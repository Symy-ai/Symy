// @vitest-environment happy-dom
/**
 * applyGuardianStylePlan 写回编排测试 (batch61-a)
 *
 * 验收红线: 预设选择后逐项写回既有渠道 (三 localStorage + 既有 push 偏好
 * PATCH), 不新建表、不新增字段; 推送失败不回滚本地三项, outcome 诚实返回。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyGuardianStylePlan } from '../guardian-style-apply';
import { buildGuardianStylePlan } from '@/lib/guardian-style';
import { GUARD_SCOPE_CATEGORIES } from '@/lib/guard-scope';
import { _resetGuardIntensityStateForTest, getGuardIntensity } from '@/hooks/use-guard-intensity';
import { _resetNightWindowStateForTest, getNightWindow } from '@/hooks/use-night-window';
import { _resetGuardScopeStateForTest, getGuardScope } from '@/hooks/use-guard-scope';

function okResponse() {
  return new Response(JSON.stringify({ preferences: { frequency: 'daily' } }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  _resetGuardIntensityStateForTest();
  _resetNightWindowStateForTest();
  _resetGuardScopeStateForTest();
  window.localStorage.clear();
});

describe('applyGuardianStylePlan', () => {
  it('一次写回四个渠道: 三个 localStorage + 既有 push 偏好 PATCH frequency', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await applyGuardianStylePlan(buildGuardianStylePlan('strictCoach'));

    expect(outcome).toBe('ok');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    expect(window.localStorage.getItem('symy-night-window')).toBe('early');
    const storedScope = JSON.parse(window.localStorage.getItem('symy-guard-scope') ?? '{}');
    for (const category of GUARD_SCOPE_CATEGORIES) {
      expect(storedScope[category], category).toBe('strict');
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/push/preferences');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ frequency: 'daily' });

    // 内存单例同步 — 设置页既有区块 (同 hook) 即时反映新值
    expect(getGuardIntensity()).toBe('strict');
    expect(getNightWindow()).toBe('early');
    expect(getGuardScope().electronics).toBe('strict');
  });

  it('PATCH 409 (推送未订阅) → pushNotSubscribed, 本地三项仍生效', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 409 })));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await applyGuardianStylePlan(buildGuardianStylePlan('gentleCompanion'));

    expect(outcome).toBe('pushNotSubscribed');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('gentle');
    expect(window.localStorage.getItem('symy-night-window')).toBe('standard');
  });

  it('PATCH 500 → pushFailed, 本地三项仍生效', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))));

    const outcome = await applyGuardianStylePlan(buildGuardianStylePlan('nightLightGuard'));

    expect(outcome).toBe('pushFailed');
    expect(window.localStorage.getItem('symy-night-window')).toBe('nightOwl');
  });

  it('网络异常 → pushFailed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    const outcome = await applyGuardianStylePlan(buildGuardianStylePlan('balancedGuard'));
    expect(outcome).toBe('pushFailed');
  });

  it('demo 模式只写本地, 不发 PATCH', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await applyGuardianStylePlan(buildGuardianStylePlan('nightLightGuard'), { isDemo: true });

    expect(outcome).toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('symy-night-window')).toBe('nightOwl');
  });
});
