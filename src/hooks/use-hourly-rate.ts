'use client';

/**
 * useHourlyRate — 全局共享的时薪状态
 *
 * 🔧 P0 fix: 之前 page.tsx / buddy-tab.tsx / profile-tab.tsx 各自独立 fetch,
 *    用户在 Profile 改了时薪后, 其他组件不会重新 fetch → 翻译仍用旧值。
 *
 * 根因修复: 用 module-level shared state + subscription pattern。
 * - 任意组件调用 setHourlyRate → 所有订阅者立即收到新值
 * - 全局只 fetch 一次 (sharedInitialized), 后续组件 mount 直接读 cache
 * - setHourlyRate 会先 optimistic update 本地 + 通知订阅者, 再异步 POST API
 *
 * 用法:
 *   const { hourlyRate, setHourlyRate } = useHourlyRate(isDemo);
 *   // 读: hourlyRate
 *   // 写: await setHourlyRate(50)
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { logger } from '@/lib/logger';
import { useAuth } from '@/components/auth/auth-provider';

export { DEFAULT_HOURLY_RATE };

// ============ Module-level shared state (单例) ============
let sharedHourlyRate: number = DEFAULT_HOURLY_RATE;
// batch26-b: true = 用户从未设置时薪 (服务端 DB null)。setHourlyRate 成功后置 false。
let sharedRateIsDefault: boolean = true;
let sharedInitialized = false;
let fetchPromise: Promise<number> | null = null;
let sharedUserId: string | null = null; // 🔧 2026-07-15: Track which user the cache belongs to
const subscribers = new Set<(rate: number) => void>();
const defaultSubscribers = new Set<(isDefault: boolean) => void>();

function notifyAll(rate: number) {
  subscribers.forEach((cb) => cb(rate));
}

function notifyAllDefault(isDefault: boolean) {
  defaultSubscribers.forEach((cb) => cb(isDefault));
}

/**
 * 🔧 2026-07-15 (ARCH-11 #5 修复): Reset shared state when user changes.
 *    旧代码: sharedHourlyRate / sharedInitialized 是全局单例, 不随用户切换重置
 *    → User A 登出后 User B 登录, User B 看到 User A 的时薪 (隐私泄漏)
 *    修复: 记录 sharedUserId, 用户变化时重置 cache
 */
function resetForUserChange(userId: string | null) {
  if (sharedUserId !== userId) {
    sharedHourlyRate = DEFAULT_HOURLY_RATE;
    sharedRateIsDefault = true;
    sharedInitialized = false;
    fetchPromise = null;
    sharedUserId = userId;
    notifyAll(sharedHourlyRate);
    notifyAllDefault(sharedRateIsDefault);
  }
}

/**
 * Reset shared state — 仅用于测试。
 * 生产代码不要调用。
 */
export function _resetHourlyRateStateForTest() {
  sharedHourlyRate = DEFAULT_HOURLY_RATE;
  sharedRateIsDefault = true;
  sharedInitialized = false;
  fetchPromise = null;
  sharedUserId = null;
  subscribers.clear();
  defaultSubscribers.clear();
}

export interface UseHourlyRateResult {
  /** 当前时薪 (默认 25) */
  hourlyRate: number;
  /** true = 用户从未设置时薪 (服务端 DB null); setHourlyRate 成功后变 false — 时薪引导胶囊据此显隐 */
  rateIsDefault: boolean;
  /** 设置时薪 — optimistic update + POST API + 通知所有订阅者 */
  setHourlyRate: (rate: number) => Promise<void>;
  /** 是否正在加载 (首次 fetch) */
  isLoading: boolean;
}

export function useHourlyRate(isDemo = false): UseHourlyRateResult {
  const [hourlyRate, setLocalRate] = useState<number>(sharedHourlyRate);
  const [rateIsDefault, setLocalRateIsDefault] = useState<boolean>(sharedRateIsDefault);
  const [isLoading, setIsLoading] = useState<boolean>(!sharedInitialized);
  // 🔧 F2 fix (Round 101): Gate fetch on auth state, not just "loading" flag.
  //   Old code fired apiFetch unconditionally on mount, causing 4× 401 errors on every cold page load.
  //   Root cause: the guard checked `sharedInitialized` (whether we'd tried before) but never
  //   checked if the user was actually authenticated. When auth finished loading (loading=false)
  //   but user was still null (not logged in), the effect ran and fired a 401.
  const { user, loading: authLoading } = useAuth();

  // 🔧 2026-07-15 (ARCH-11 #5 修复): 用户变化时重置 cache (防跨用户数据泄漏)
  useEffect(() => {
    resetForUserChange(user?.id ?? null);
  }, [user?.id]);

  // 订阅共享状态变化
  useEffect(() => {
    const cb = (rate: number) => setLocalRate(rate);
    const cbDefault = (isDefault: boolean) => setLocalRateIsDefault(isDefault);
    subscribers.add(cb);
    defaultSubscribers.add(cbDefault);
    return () => {
      subscribers.delete(cb);
      defaultSubscribers.delete(cbDefault);
    };
  }, []);

  // 首次 mount 时 fetch (如果尚未初始化)
  useEffect(() => {
    if (isDemo) {
      setIsLoading(false);
      return;
    }
    // 🔧 F2 fix (Round 101): Do NOT fetch if auth is still loading OR user is not authenticated.
    //   This prevents the 401 storm on cold page loads.
    if (authLoading || !user) {
      return;
    }
    if (sharedInitialized) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
          const data = await apiFetch<{ hourlyRate: number; default?: boolean; isDefault?: boolean }>(
            '/api/user/hourly-rate'
          );
          const rate = data.hourlyRate || DEFAULT_HOURLY_RATE;
          sharedHourlyRate = rate;
          sharedRateIsDefault = data.isDefault ?? true;
          sharedInitialized = true;
          notifyAll(sharedHourlyRate);
          notifyAllDefault(sharedRateIsDefault);
        } catch (err) {
          logger.warn('[useHourlyRate] Failed to fetch hourly rate:', err);
          // 🔧 PM3 fix: 401 时不设置 sharedInitialized = true, 允许用户登录后重新 fetch
          //   旧代码: 401 时 sharedInitialized = true → 用户登录后不重新 fetch → 永远用默认值
          //   新代码: 401 时不设置 sharedInitialized, 允许后续 mount 重试
          //   非 401 错误 (如网络错误) 仍设置 sharedInitialized = true 避免频繁重试
          const isAuthError = err && typeof err === 'object' && 'status' in err && err.status === 401;
          if (!isAuthError) {
            sharedInitialized = true; // Don't retry on every mount (non-auth errors)
          }
          notifyAll(sharedHourlyRate);
        } finally {
          fetchPromise = null;
        }
        return sharedHourlyRate;
      })();
    }

    fetchPromise.then((rate) => {
      if (!cancelled) {
        setLocalRate(rate);
        setIsLoading(false);
      }
    }).catch(() => {
      // 🔧 ARCH fix (2026-07-21): Defensive catch — the IIFE has internal try/catch
      //    so this should never fire, but prevents unhandled rejection if IIFE is modified.
      if (!cancelled) {
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isDemo, authLoading, user]);

  // 🔧 P0 fix: 当用户切换浏览器 tab 回来时, 重新 fetch 时薪
  //    确保拿到最新值 (以防 shared state 在某些 edge case 下没同步)
  useEffect(() => {
    if (isDemo) return;
    // 🔧 F2 fix (Round 101): Don't attach visibility listener if user not authenticated.
    //   Prevents 401 errors when unauthenticated users switch tabs.
    if (!user) return;
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && sharedInitialized) {
        // 重新 fetch 最新时薪
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        apiFetch<{ hourlyRate: number; default?: boolean; isDefault?: boolean }>(
          '/api/user/hourly-rate'
        ).then((result) => {
          const rate = result.hourlyRate || DEFAULT_HOURLY_RATE;
          const isDefault = result.isDefault ?? true;
          if (rate !== sharedHourlyRate || isDefault !== sharedRateIsDefault) {
            sharedHourlyRate = rate;
            sharedRateIsDefault = isDefault;
            notifyAll(sharedHourlyRate);
            notifyAllDefault(sharedRateIsDefault);
          }
        }).catch(() => {
          // 静默失败 — 不影响已有值
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isDemo, user]);

  const setHourlyRate = useCallback(
  // eslint-disable-next-line symy/no-async-callback-mutation
    async (rate: number) => {
      // 🔧 P0 fix (2026-07-10): 保存旧值用于失败回滚
      //   旧代码: 乐观更新后不回滚 → 后端拒绝 (如 >100万) 但前端仍显示新值 → 用户以为保存成功
      //   新代码: 保存 oldRate, POST 失败时回滚到 oldRate 并 throw 让调用方显示错误
      const oldRate = sharedHourlyRate;

      // Optimistic update — 立即更新本地 + 通知所有订阅者
      sharedHourlyRate = rate;
      setLocalRate(rate);
      notifyAll(rate);

      if (!isDemo) {
        try {
          await apiFetch('/api/user/hourly-rate', {
            method: 'POST',
            body: { hourlyRate: rate },
          });
          // batch26-b: 保存成功 = 用户已自设时薪 (失败走 catch 回滚, 标记不动)
          sharedRateIsDefault = false;
          notifyAllDefault(false);
        } catch (err) {
          logger.warn('[useHourlyRate] Failed to save hourly rate:', err);
          // 🔧 P0 fix: 回滚乐观更新 — 后端拒绝时恢复旧值
          //   旧代码: "不回滚 — 用户可能网络错误, 但本地值已经改了, 下次 mount 会重新 fetch"
          //   问题: 后端校验失败 (如 >100万) 时也走这个路径, 但本地值仍是新值, 用户以为保存成功
          //   新代码: 回滚到 oldRate, 让 UI 显示真实的服务端值, 并 throw 让调用方显示错误
          sharedHourlyRate = oldRate;
          setLocalRate(oldRate);
          notifyAll(oldRate);
          throw err;
        }
      } else {
        // demo 模式无服务端, 本地保存成功同样视为已自设
        sharedRateIsDefault = false;
        notifyAllDefault(false);
      }
    },
    [isDemo]
  );

  return { hourlyRate, rateIsDefault, setHourlyRate, isLoading };
}
