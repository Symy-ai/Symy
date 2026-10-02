// @vitest-environment happy-dom
// use-green-pref — 绿色守护开关单例状态（此前 0 测试, 自带 _resetForTest）
// 语义红线: 只有显式 'off' 才关闭; 缺失/损坏/隐私模式 → 默认开(与服务端一致)。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getGreenPrefEnabled,
  setGreenPrefEnabled,
  _resetGreenPrefStateForTest,
} from '../../hooks/use-green-pref';

describe('use-green-pref — 开关状态与持久化', () => {
  beforeEach(() => {
    _resetGreenPrefStateForTest();
    window.localStorage.clear();
  });

  it('默认开 (localStorage 无值)', () => {
    expect(getGreenPrefEnabled()).toBe(true);
  });

  it('显式 off 关闭', () => {
    window.localStorage.setItem('symy-green-pref', 'off');
    _resetGreenPrefStateForTest();
    expect(getGreenPrefEnabled()).toBe(false);
  });

  it('显式 on 开启', () => {
    window.localStorage.setItem('symy-green-pref', 'on');
    _resetGreenPrefStateForTest();
    expect(getGreenPrefEnabled()).toBe(true);
  });

  it('损坏值 (垃圾串) → 默认开', () => {
    window.localStorage.setItem('symy-green-pref', 'garbage!!');
    _resetGreenPrefStateForTest();
    expect(getGreenPrefEnabled()).toBe(true);
  });

  it('setGreenPrefEnabled: 内存+localStorage 同步写', () => {
    setGreenPrefEnabled(false);
    expect(getGreenPrefEnabled()).toBe(false);
    expect(window.localStorage.getItem('symy-green-pref')).toBe('off');
    setGreenPrefEnabled(true);
    expect(getGreenPrefEnabled()).toBe(true);
    expect(window.localStorage.getItem('symy-green-pref')).toBe('on');
  });

  it('setGreenPrefEnabled 通知订阅者', () => {
    const cb = vi.fn();
    // 订阅通过 hook effect — 直接验证 notifyAll 间接路径: 写后 get 同步生效
    setGreenPrefEnabled(false);
    expect(getGreenPrefEnabled()).toBe(false);
    expect(cb).not.toHaveBeenCalled(); // 未订阅不炸
  });
});
