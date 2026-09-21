'use client';

/**
 * useGreenPrefs — 全局绿色偏好包 (冻结态)
 *
 * 一次性管理绿色偏好, localStorage 持久化 (`symy-green-prefs`):
 * - wording:    替代话术风格
 * - pushTheme:  push 绿色主题
 *
 * resetGreenPrefs 仅清可重建数据 (偏好 / 缓存 / 演示标记),
 * 不碰账户、buddy 历史、真实订单与荣誉。
 *
 * 语义: 默认最温和档; 锁定/冻结由设置页本地状态控制, 不落盘。
 */

import { useState, useEffect, useCallback } from 'react';

export type Wording = 'cheerful' | 'neutral' | 'direct';
export type PushTheme = 'none' | 'seasonal' | 'guardian';

interface GreenPrefs {
  wording: Wording;
  pushTheme: PushTheme;
}

const STORAGE_KEY = 'symy-green-prefs';

const DEFAULT_PREFS: GreenPrefs = {
  wording: 'cheerful',
  pushTheme: 'none',
};

/** 可重建的 localStorage key 子集 (reset 时清理) */
const RESET_KEYS: string[] = [
  STORAGE_KEY,
  'symy-companion-open-dates',
  'symy-welcome-back-last-seen',
  'symy-onboarding-seen',
];

function readStoredPrefs(): GreenPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<GreenPrefs> & { intensity?: unknown };
    delete parsed.intensity;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    // safe to ignore: corrupted localStorage falls back to default prefs
    return DEFAULT_PREFS;
  }
}

function writeStoredPrefs(prefs: GreenPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // safe to ignore
  }
}

// ============ Module-level shared state (单例) ============
let sharedPrefs = { ...DEFAULT_PREFS };
let sharedInitialized = false;
const subscribers = new Set<(prefs: GreenPrefs) => void>();

function notifyAll(prefs: GreenPrefs) {
  subscribers.forEach((cb) => cb(prefs));
}

export function getGreenPrefs(): GreenPrefs {
  if (!sharedInitialized) {
    sharedPrefs = readStoredPrefs();
    sharedInitialized = true;
  }
  return sharedPrefs;
}

export function getLegacyGreenIntensity(): unknown {
  if (typeof window === 'undefined') return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as { intensity?: unknown };
    return parsed.intensity;
  } catch {
    // safe to ignore: malformed legacy data cannot be migrated
    return undefined;
  }
}

export function setGreenPrefs(prefs: GreenPrefs): void {
  sharedPrefs = { ...prefs };
  sharedInitialized = true;
  writeStoredPrefs(prefs);
  notifyAll(prefs);
}

export function setGreenPrefField<K extends keyof GreenPrefs>(key: K, value: GreenPrefs[K]): void {
  setGreenPrefs({ ...sharedPrefs, [key]: value });
}

export function clearLegacyGreenIntensity(): void {
  if (typeof window === 'undefined') return;
  if (getLegacyGreenIntensity() === undefined) return;
  setGreenPrefs(getGreenPrefs());
}

export function resetGreenPrefs(): void {
  try {
    for (const key of RESET_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // safe to ignore
  }
  const reset = { ...DEFAULT_PREFS };
  sharedPrefs = reset;
  sharedInitialized = true;
  writeStoredPrefs(reset);
  notifyAll(reset);
}

export interface UseGreenPrefsResult {
  prefs: GreenPrefs;
  setGreenPrefs: (prefs: GreenPrefs) => void;
  setGreenPrefField: <K extends keyof GreenPrefs>(key: K, value: GreenPrefs[K]) => void;
  resetGreenPrefs: () => void;
}

export function useGreenPrefs(): UseGreenPrefsResult {
  const [prefs, setLocalPrefs] = useState<GreenPrefs>(sharedPrefs);

  useEffect(() => {
    const stored = readStoredPrefs();
    if (!sharedInitialized || stored.wording !== sharedPrefs.wording || stored.pushTheme !== sharedPrefs.pushTheme) {
      sharedPrefs = stored;
      sharedInitialized = true;
    }

    const cb = (next: GreenPrefs) => setLocalPrefs(next);
    subscribers.add(cb);
    setLocalPrefs(sharedPrefs);

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = readStoredPrefs();
        sharedPrefs = next;
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

  const setter = useCallback((next: GreenPrefs) => setGreenPrefs(next), []);
  const setField = useCallback(<K extends keyof GreenPrefs>(key: K, value: GreenPrefs[K]) => setGreenPrefField(key, value), []);
  const resetter = useCallback(() => resetGreenPrefs(), []);

  return { prefs, setGreenPrefs: setter, setGreenPrefField: setField, resetGreenPrefs: resetter };
}

export function _resetGreenPrefsStateForTest() {
  sharedPrefs = { ...DEFAULT_PREFS };
  sharedInitialized = false;
  subscribers.clear();
}
