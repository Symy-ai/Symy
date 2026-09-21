'use client';

/**
 * useGuardIntensity — 全局共享的「守护强度」三档状态 (batch48-a)
 *
 * 仿 use-green-pref.ts 的 module-level shared state + subscription 模式,
 * 持久化走 localStorage ('symy-guard-intensity') — 零 DDL, 与绿色守护开关同一
 * 通路: 服务端经 chat 请求 body.guardIntensity 感知 (letta-turn-context 注入
 * prompt 指令行)。demo 模式同样只写 localStorage, 不落库不报错。
 *
 * 语义: 缺失/损坏/隐私模式 → 默认 balanced (与现状行为一致)。
 *
 * 用法:
 *   const { guardIntensity, setGuardIntensity } = useGuardIntensity();
 *   // 非组件/imperative 路径 (如拼 chat 请求 body): getGuardIntensity()
 */

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_GUARD_INTENSITY, normalizeGuardIntensity, type GuardIntensity } from '@/lib/guard-intensity';
import { clearLegacyGreenIntensity, getLegacyGreenIntensity } from '@/hooks/use-green-prefs';

const STORAGE_KEY = 'symy-guard-intensity';

/** 绿色偏好四档中被收敛掉的两个加严档 → 三档系统的 strict (batch95-a, 99-d 定案) */
const LEGACY_ELEVATED_GREEN_INTENSITIES: ReadonlySet<string> = new Set(['firm', 'lockdown']);

function readStoredIntensity(): GuardIntensity {
  if (typeof window === 'undefined') return DEFAULT_GUARD_INTENSITY;
  try {
    return normalizeGuardIntensity(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // safe to ignore: 隐私模式/quota 失败 → 默认 balanced
    return DEFAULT_GUARD_INTENSITY;
  }
}

function writeStoredIntensity(level: GuardIntensity): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // safe to ignore: 持久化失败时内存值仍生效, 本次会话内档位照常工作
  }
}

// ============ Module-level shared state (单例) ============
let sharedIntensity: GuardIntensity = DEFAULT_GUARD_INTENSITY;
let sharedInitialized = false;
const subscribers = new Set<(level: GuardIntensity) => void>();

function notifyAll(level: GuardIntensity) {
  subscribers.forEach((cb) => cb(level));
}

export function getGuardIntensity(): GuardIntensity {
  if (!sharedInitialized) {
    sharedIntensity = readStoredIntensity();
    sharedInitialized = true;
  }
  return sharedIntensity;
}

export function setGuardIntensity(level: GuardIntensity): void {
  sharedIntensity = level;
  sharedInitialized = true;
  writeStoredIntensity(level);
  notifyAll(level);
}

export interface UseGuardIntensityResult {
  guardIntensity: GuardIntensity;
  setGuardIntensity: (level: GuardIntensity) => void;
}

export function useGuardIntensity(): UseGuardIntensityResult {
  const [guardIntensity, setLocal] = useState<GuardIntensity>(sharedIntensity);

  useEffect(() => {
    setLocal(getGuardIntensity());
    const cb = (next: GuardIntensity) => setLocal(next);
    subscribers.add(cb);

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = readStoredIntensity();
        sharedIntensity = next;
        sharedInitialized = true;
        notifyAll(next);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => {
      subscribers.delete(cb);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setter = useCallback((next: GuardIntensity) => setGuardIntensity(next), []);

  return { guardIntensity, setGuardIntensity: setter };
}

/**
 * batch95-a 强度双系统收敛的一次性迁移: 历史在绿色偏好里选过 firm/lockdown 的
 * 用户映射到三档系统最高档 strict, 防止 UI 收敛后被感知为「变弱」; 同时移除
 * 已无消费方的 legacy intensity 字段, 保证迁移一次性。只在守护强度 key 尚无
 * 显式选择时迁移 (该 key 只由 GuardIntensitySetting 写入, 存在即代表用户已
 * 显式选档, 尊重之)。
 *
 * 返回是否发生了迁移 (测试断言用)。放在 hooks 层: 需要经 use-green-prefs 单例
 * 改写偏好并通知订阅者, lib 层不得反向导入 hooks (架构守卫红线)。
 */
export function migrateLegacyGreenIntensity(): boolean {
  if (typeof window === 'undefined') return false;
  let hasExplicitGuardChoice = false;
  try {
    hasExplicitGuardChoice = window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // safe to ignore: 隐私模式读不到 localStorage, 迁移无从谈起
    return false;
  }
  if (hasExplicitGuardChoice) return false;

  const legacyIntensity = getLegacyGreenIntensity();
  if (typeof legacyIntensity !== 'string' || !LEGACY_ELEVATED_GREEN_INTENSITIES.has(legacyIntensity)) return false;

  setGuardIntensity('strict');
  clearLegacyGreenIntensity();
  return true;
}

export function _resetGuardIntensityStateForTest() {
  sharedIntensity = DEFAULT_GUARD_INTENSITY;
  sharedInitialized = false;
  subscribers.clear();
}
