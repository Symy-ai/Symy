// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getGuardScope, useGuardScope, _resetGuardScopeStateForTest } from '@/hooks/use-guard-scope';

describe('useGuardScope', () => {
  afterEach(() => {
    cleanup();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('默认值为五个品类全 guard', () => {
    const { result } = renderHook(() => useGuardScope());
    expect(result.current.guardScope).toEqual({
      electronics: 'guard',
      clothing: 'guard',
      beauty: 'guard',
      home: 'guard',
      food: 'guard',
    });
  });

  it('切换范围枚举并同步共享单例与 localStorage', () => {
    const { result } = renderHook(() => useGuardScope());
    act(() => result.current.setGuardScopeMode('food', 'exempt'));
    act(() => result.current.setGuardScopeMode('electronics', 'strict'));

    expect(result.current.guardScope).toMatchObject({ electronics: 'strict', food: 'exempt' });
    expect(getGuardScope()).toEqual(result.current.guardScope);
    expect(JSON.parse(window.localStorage.getItem('symy-guard-scope') || '{}')).toEqual(result.current.guardScope);
  });

  it('无效品类与非法档位不产生状态变化', () => {
    const { result } = renderHook(() => useGuardScope());
    act(() => result.current.setGuardScopeMode('unknown' as never, 'exempt'));
    act(() => result.current.setGuardScopeMode('food', 'banana' as never));
    expect(result.current.guardScope.food).toBe('guard');
  });

  it('损坏存储读取时降级默认值', () => {
    window.localStorage.setItem('symy-guard-scope', '{broken');
    _resetGuardScopeStateForTest();
    expect(getGuardScope().electronics).toBe('guard');
  });
});
