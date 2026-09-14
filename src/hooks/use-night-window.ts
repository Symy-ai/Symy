'use client';

/**
 * useNightWindow — 全局共享的「我的深夜时段」四档状态 (batch49-a)
 *
 * 仿 use-guard-intensity.ts 的 module-level shared state + subscription 模式,
 * 持久化走 localStorage ('symy-night-window') — 零 DDL。
 * 档位语义见 src/lib/night-window.ts; 缺失/损坏/隐私模式 → standard
 * (与 batch48-c 默认 22:00–05:00 行为一致)。
 *
 * 用法:
 *   const { nightWindow, setNightWindow } = useNightWindow();
 *   // 非组件路径: getNightWindow() / nightWindowToHours(getNightWindow())
 */

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_NIGHT_WINDOW, normalizeNightWindow, type NightWindowPreset } from '@/lib/night-window';

const STORAGE_KEY = 'symy-night-window';

function readStoredNightWindow(): NightWindowPreset {
  if (typeof window === 'undefined') return DEFAULT_NIGHT_WINDOW;
  try {
    return normalizeNightWindow(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // safe to ignore: 隐私模式/quota 失败 → 默认 standard
    return DEFAULT_NIGHT_WINDOW;
  }
}

function writeStoredNightWindow(preset: NightWindowPreset): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // safe to ignore: 持久化失败时内存值仍生效, 本次会话内档位照常工作
  }
}

// ============ Module-level shared state (单例) ============
let sharedNightWindow: NightWindowPreset = DEFAULT_NIGHT_WINDOW;
let sharedInitialized = false;
const subscribers = new Set<(preset: NightWindowPreset) => void>();

function notifyAll(preset: NightWindowPreset) {
  subscribers.forEach((cb) => cb(preset));
}

export function getNightWindow(): NightWindowPreset {
  if (!sharedInitialized) {
    sharedNightWindow = readStoredNightWindow();
    sharedInitialized = true;
  }
  return sharedNightWindow;
}

export function setNightWindow(preset: NightWindowPreset): void {
  sharedNightWindow = preset;
  sharedInitialized = true;
  writeStoredNightWindow(preset);
  notifyAll(preset);
}

export interface UseNightWindowResult {
  nightWindow: NightWindowPreset;
  setNightWindow: (preset: NightWindowPreset) => void;
}

export function useNightWindow(): UseNightWindowResult {
  const [nightWindow, setLocal] = useState<NightWindowPreset>(sharedNightWindow);

  useEffect(() => {
    setLocal(getNightWindow());
    const cb = (next: NightWindowPreset) => setLocal(next);
    subscribers.add(cb);

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = readStoredNightWindow();
        sharedNightWindow = next;
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

  const setter = useCallback((next: NightWindowPreset) => setNightWindow(next), []);

  return { nightWindow, setNightWindow: setter };
}

export function _resetNightWindowStateForTest() {
  sharedNightWindow = DEFAULT_NIGHT_WINDOW;
  sharedInitialized = false;
  subscribers.clear();
}
