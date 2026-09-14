'use client';

/**
 * useGreenPref — 全局共享的「绿色守护模式」开关状态
 *
 * 仿 use-hourly-rate.ts 的 module-level shared state + subscription 模式,
 * 持久化走 localStorage ('symy-green-pref', 值 'on'|'off') — 零 DDL:
 * profiles 表没有 green_pref 列, 服务端通过 chat 请求 body.greenPref 感知
 * (context-builder 请求级覆盖优先于 profiles 探测, 见 getSymyGreenContext)。
 *
 * 语义: 只有显式 'off' 才关闭; 缺失/损坏/隐私模式 → 默认开 (与服务端一致)。
 *
 * 用法:
 *   const { greenPrefEnabled, setGreenPrefEnabled } = useGreenPref();
 *   // 组件读: greenPrefEnabled (商品卡绿色徽章/置顶、绿色替代话术触发都以此静默)
 *   // 写: setGreenPrefEnabled(false) — optimistic + localStorage 持久化 + 通知所有订阅者
 *   // 非组件/imperative 路径 (如拼 chat 请求 body): getGreenPrefEnabled()
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'symy-green-pref';

function readStoredGreenPref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // safe to ignore: 隐私模式/quota 失败 → 默认开, 与服务端缺省一致
    return true;
  }
}

function writeStoredGreenPref(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // safe to ignore: 持久化失败时内存值仍然生效, 本次会话内开关照常工作
  }
}

// ============ Module-level shared state (单例) ============
let sharedEnabled = true;
let sharedInitialized = false;
const subscribers = new Set<(enabled: boolean) => void>();

function notifyAll(enabled: boolean) {
  subscribers.forEach((cb) => cb(enabled));
}

/**
 * 非组件读取入口 — 供 chat 请求 body 拼装等 imperative 路径使用。
 * 首次调用时从 localStorage 水合, 之后读共享缓存 (写入方负责同步缓存)。
 */
export function getGreenPrefEnabled(): boolean {
  if (!sharedInitialized) {
    sharedEnabled = readStoredGreenPref();
    sharedInitialized = true;
  }
  return sharedEnabled;
}

/** 写入入口 — optimistic 更新 + localStorage 持久化 + 通知所有订阅者 */
export function setGreenPrefEnabled(enabled: boolean) {
  sharedEnabled = enabled;
  sharedInitialized = true;
  writeStoredGreenPref(enabled);
  notifyAll(enabled);
}

/**
 * Reset shared state — 仅用于测试。
 * 生产代码不要调用。
 */
export function _resetGreenPrefStateForTest() {
  sharedEnabled = true;
  sharedInitialized = false;
  subscribers.clear();
}

export interface UseGreenPrefResult {
  /** 绿色守护是否开启 (默认 true; 关闭时绿色徽章/置顶/替代话术全部静默) */
  greenPrefEnabled: boolean;
  /** 切换开关 — 立即生效并持久化到 localStorage */
  setGreenPrefEnabled: (enabled: boolean) => void;
}

export function useGreenPref(): UseGreenPrefResult {
  // 初值读共享缓存 (SSR/水合首帧为默认 true, 与服务端渲染一致, 无 hydration mismatch)
  const [greenPrefEnabled, setLocalEnabled] = useState<boolean>(sharedEnabled);

  useEffect(() => {
    // 首个 mount 从 localStorage 水合 (共享缓存可能还是默认值)
    const stored = readStoredGreenPref();
    if (!sharedInitialized || stored !== sharedEnabled) {
      sharedEnabled = stored;
      sharedInitialized = true;
    }

    const cb = (enabled: boolean) => setLocalEnabled(enabled);
    // 先订阅再水合: notifyAll 不回放给晚到的订阅者, 本组件必须显式同步一次
    // (否则首帧渲染用的默认 true 会永远停留 — 刷新后开关显示错)
    subscribers.add(cb);
    setLocalEnabled(sharedEnabled);

    // 跨标签页同步: 其他 tab 改了开关, 本 tab 立即跟随
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const value = readStoredGreenPref();
        sharedEnabled = value;
        sharedInitialized = true;
        notifyAll(value);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => {
      subscribers.delete(cb);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setGreenPrefEnabled(enabled);
  }, []);

  return { greenPrefEnabled, setGreenPrefEnabled: setEnabled };
}
