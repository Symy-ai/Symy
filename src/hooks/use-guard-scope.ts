'use client';

/**
 * useGuardScope — 全局共享的「守护范围」三态状态 (batch53-b)
 *
 * 仿 use-guard-intensity.ts 的 module-level shared state + subscription 模式,
 * 持久化走 localStorage ('symy-guard-scope', JSON 形状) — 零 DDL, 与守护强度
 * 同一通路: 服务端经 chat 请求 body.guardScope 感知 (letta-turn-context 注入
 * scope 指令行 + green-alt 预检按豁免品类静默卡片)。
 *
 * 语义: 缺失/损坏/隐私模式 → 全默认 (每品类 guard, 行为与现状一致)。
 *
 * 用法:
 *   const { guardScope, setGuardScopeMode } = useGuardScope();
 *   // 非组件路径 (拼 chat 请求 body): getGuardScope()
 */

import { useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_GUARD_SCOPE_MODE,
  defaultGuardScope,
  isGuardScopeCategory,
  isGuardScopeMode,
  normalizeGuardScope,
  type GuardScope,
  type GuardScopeCategory,
  type GuardScopeMode,
} from '@/lib/guard-scope';

const STORAGE_KEY = 'symy-guard-scope';

function readStoredScope(): GuardScope {
  if (typeof window === 'undefined') return defaultGuardScope();
  try {
    return normalizeGuardScope(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // safe to ignore: 隐私模式/quota 失败 → 全默认 (与现状行为一致)
    return defaultGuardScope();
  }
}

function writeStoredScope(scope: GuardScope): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } catch {
    // safe to ignore: 持久化失败时内存值仍生效, 本次会话内范围照常工作
  }
}

// ============ Module-level shared state (单例) ============
let sharedScope: GuardScope = defaultGuardScope();
let sharedInitialized = false;
const subscribers = new Set<(scope: GuardScope) => void>();

function notifyAll(scope: GuardScope) {
  subscribers.forEach((cb) => cb(scope));
}

export function getGuardScope(): GuardScope {
  if (!sharedInitialized) {
    sharedScope = readStoredScope();
    sharedInitialized = true;
  }
  return sharedScope;
}

/** 单品类改档 — 唯一写入口 (整表替换防半写状态) */
export function setGuardScopeMode(category: GuardScopeCategory, mode: GuardScopeMode): void {
  const next = { ...getGuardScope(), [category]: mode };
  sharedScope = next;
  sharedInitialized = true;
  writeStoredScope(next);
  notifyAll(next);
}

export interface UseGuardScopeResult {
  guardScope: GuardScope;
  setGuardScopeMode: (category: GuardScopeCategory, mode: GuardScopeMode) => void;
}

export function useGuardScope(): UseGuardScopeResult {
  const [guardScope, setLocal] = useState<GuardScope>(sharedScope);

  useEffect(() => {
    setLocal(getGuardScope());
    const cb = (next: GuardScope) => setLocal(next);
    subscribers.add(cb);

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = readStoredScope();
        sharedScope = next;
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

  const setter = useCallback(
    (category: GuardScopeCategory, mode: GuardScopeMode) => {
      if (!isGuardScopeCategory(category) || !isGuardScopeMode(mode)) return;
      setGuardScopeMode(category, mode);
    },
    [],
  );

  return { guardScope, setGuardScopeMode: setter };
}

export function _resetGuardScopeStateForTest() {
  sharedScope = defaultGuardScope();
  sharedInitialized = false;
  subscribers.clear();
}

export { DEFAULT_GUARD_SCOPE_MODE };
