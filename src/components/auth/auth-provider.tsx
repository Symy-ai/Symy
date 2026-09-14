'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { identifyUser, resetUser } from '@/lib/posthog';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

// Paths that don't require authentication
// Note: / (main page) is now always accessible for demo browsing
const _PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/auth/callback'];

/**
 * Force-clear all Supabase auth cookies from document.cookie.
 *
 * Why: When supabase.auth.signOut() throws (e.g. network error),
 * the GoTrueClient skips _removeSession() and cookies survive.
 * This function ensures cookies are always cleared regardless.
 *
 * Also handles chunked cookies (sb-xxx-auth-token.0, .1, etc.)
 * and code-verifier / user metadata cookies.
 */
function clearSupabaseCookies() {
  if (typeof document === 'undefined') return;
  const prefix = 'sb-';
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const name = cookie.split('=')[0].trim();
    if (name.startsWith(prefix)) {
      // Clear with Path=/ and the most common domain variations
      // 🔧 ARCH fix (Round 23 CRITICAL-1 — 缺 Secure flag → HTTPS 生产环境登出失败):
      //    生产环境 (HTTPS) 下 Supabase auth cookie 默认 Secure: true (@supabase/ssr 在 HTTPS URL 下设置)。
      //    旧代码 document.cookie = 'name=; Max-Age=0; Path=/' 不含 Secure → 浏览器静默拒绝删除。
      //    后果: signOut 失败时 cookie 残留 → 用户"登出"后仍处于登录状态 (鉴权绕过)。
      //    根因修复: 加 Secure flag (HTTPS 下生效, HTTP localhost 开发不受影响)。
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      document.cookie = `${name}=; Max-Age=0; Path=/; Secure`;
    }
  }
}

/**
 * 确保用户有 Letta Agent（后台调用，不阻塞 UI）
 *
 * 用途：处理在 agent 创建功能上线之前就已注册的老用户。
 * 这些老用户登录时没有 letta_agent_id，这里会触发创建。
 *
 * 新用户：auth callback 已在账户激活时创建了 agent，这里会返回 "already exists"
 * 老用户：没有 letta_agent_id，这里会触发创建
 */
// 🔧 BUG-59 fix: 使用模块级变量替代 useRef，防止组件重新挂载时重复调用
// 🔧 架构优化 Round 62 (Finding 10): 确认为 intentional singleton — AuthProvider 在 app 中只有一个实例
//    如果未来支持多实例 (测试/嵌套布局), 需要改为 useRef 或 WeakMap
//    当前 signOut 会重置这些变量 (line 269-270)
let _agentEnsuredUserId: string | null = null;
// 🔧 BUG-104 fix: 添加 in-flight 锁，防止 React Strict Mode / auth 事件重复触发导致并发 API 调用
// 🔧 ARCH fix (user-switch race): 旧代码用 boolean 锁 — A 用户 in-flight 时 B 用户登录会被锁阻塞,
//   导致 B 用户的 agent 永远不会被创建。改为按 userId 加锁, 不同用户的请求互不阻塞。
let _agentEnsureInFlightUserId: string | null = null;
// 🔧 F5 fix (Round 101): Add per-userId lock for locale sync POST.
//   Without this, React Strict Mode (double-invoke useEffect) and onAuthStateChange
//   firing twice on login caused 2× POST /api/user/locale (one aborted, one succeeded).
let _localeSyncInFlightUserId: string | null = null;
// 🔧 F5 fix (Round 101): Track users we've ALREADY synced locale for (per session).
//   The in-flight lock above prevents concurrent calls, but if the first call aborts
//   (e.g., React Strict Mode cleanup), the lock clears and a second call fires.
//   This Set ensures we only sync ONCE per user per session, even across aborts.
const _localeSyncCompletedUserIds = new Set<string>();

async function ensureAgentForUser(userId: string) {
  // 防止同一用户重复调用
  if (_agentEnsuredUserId === userId) return;
  // 🔧 ARCH fix: 只阻塞同一 userId 的并发, 不阻塞不同 userId
  if (_agentEnsureInFlightUserId === userId) return;

  _agentEnsureInFlightUserId = userId;
  try {
    // 🔧 ARCH fix (Round 39 — raw fetch 绕过 apiFetch → 无 credentials/timeout/401 处理):
    //    根因修复: 用 apiFetch (统一 credentials + timeout + ApiError)
    const data = await apiFetch<{ agentId?: string }>('/api/letta/agent', {
      method: 'POST',
      body: { action: 'ensure' },
    });

    if (data.agentId) {
      // BUG-97 fix: Only set guard AFTER successful API response.
      // If the API fails, we want to retry on next render/auth change.
      // 🔧 ARCH fix: 只在仍是同一 userId 时才标记已确保（防止 A 的响应到达时已切到 B）
      if (_agentEnsureInFlightUserId === userId) {
        _agentEnsuredUserId = userId;
        logger.info('[Auth] ✅ Agent ensured for user:', userId, 'agent_id:', data.agentId);
      }
    }
  } catch (err) {
    logger.warn('[Auth] Agent ensure error (will retry):', err);
  } finally {
    // 🔧 ARCH fix: 只在仍是同一 userId 时才清锁（防止 A 的 finally 清掉 B 的锁）
    if (_agentEnsureInFlightUserId === userId) {
      _agentEnsureInFlightUserId = null;
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
       
      setLoading(false);
      return;
    }

    // Reuse the singleton browser client (never create a second one)
    const client = createClient();
    // 🔧 ARCH fix (Top-10 #4): createClient() 现在返回 SupabaseClient | null
    if (!client) {
      setLoading(false);
      return;
    }

    // 🔧 ARCH fix (getUser vs onAuthStateChange race):
    //    旧代码: getUser() 异步, onAuthStateChange 可能先触发并 setUser(newUser),
    //    然后 getUser() 的 Promise resolve 用 STALE user 覆盖 newUser。
    //    典型场景: 登录回调 / 多 tab 同步 / session restore。
    //    根因修复: 用 realtimeFired 标志, 若 onAuthStateChange 已触发, getUser 的结果丢弃。
    let realtimeFired = false;

    // Listen for auth changes
    // Ignore TOKEN_REFRESHED events to prevent redirect loops
    // (session briefly becomes null during refresh in some edge cases)
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event, session) => {
        realtimeFired = true;
        // BUG-85 fix: Still update user state on TOKEN_REFRESHED (metadata may have changed)
        // but skip redirect/loading logic
        if (event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
          return;
        }
        // 🔧 BUG-233 fix: Reset agent ensure state on sign-in/sign-out to handle
        // user switching within same page session without full reload
        if (event === 'SIGNED_IN' && session?.user?.id !== _agentEnsuredUserId) {
          _agentEnsuredUserId = null;
          _agentEnsureInFlightUserId = null;
        }
        if (event === 'SIGNED_OUT') {
          _agentEnsuredUserId = null;
          _agentEnsureInFlightUserId = null;
        }
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    // Get initial session (after subscribing so realtimeFired can be set first)
    // BUG-85 fix: Add .catch() to prevent permanent loading state on network error
    client.auth.getUser().then(({ data: { user } }) => {
      // 🔧 ARCH fix: 若 onAuthStateChange 已先触发, 丢弃 getUser 的 stale 结果
      if (realtimeFired) return;
      setUser(user);
      setLoading(false);
    }).catch(() => {
      if (realtimeFired) return;
      setUser(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  // 当用户登录时，确保用户有 Letta Agent
  // 这是给老用户（在 agent 创建功能上线前注册的）准备的
  useEffect(() => {
    if (!user?.id || !configured) return;

    // PostHog: identify user with Supabase ID only (no PII — GDPR)
    identifyUser(user.id);

    // 🔧 BUG-59 fix: 防重复检查已移至模块级 ensureAgentForUser 函数内
    // 后台触发 agent 创建（不阻塞 UI）
    ensureAgentForUser(user.id);

    // 🔧 N55 fix: 登录后从 user_metadata 恢复 theme/locale（防 localStorage 被清空）
    const meta = user.user_metadata as { theme?: string; locale?: string } | undefined;
    if (meta?.theme || meta?.locale) {
      try {
        if (meta.theme && !localStorage.getItem('symy-theme')) {
          localStorage.setItem('symy-theme', meta.theme);
        }
        if (meta.locale && !localStorage.getItem('symy-locale')) {
          localStorage.setItem('symy-locale', meta.locale);
        }
      } catch (err) {
        // safe to ignore: localStorage/auth metadata sync failure — non-critical, doesn't block login
        logger.warn('[Auth] Failed to sync user metadata to localStorage:', err);
      }
    }

    // N73 fix: 登录时同步当前 locale 到 profiles 表
    // 🔧 ARCH fix (Round 2 H7): 同时同步 timezone (IANA 格式) 用于 impulse score 计算
    // 🔧 F5 fix (Round 101): Add per-userId in-flight lock to prevent duplicate POSTs.
    //   Without this, React Strict Mode double-invoke + onAuthStateChange firing twice
    //   on login caused 2× POST /api/user/locale (one aborted, one succeeded).
    const currentLocale = typeof window !== 'undefined' ? localStorage.getItem('symy-locale') : null;
    const userTimezone = typeof window !== 'undefined' && typeof Intl !== 'undefined'
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone || undefined)
      : undefined;

    if ((currentLocale && (currentLocale === 'en' || currentLocale === 'zh')) || userTimezone) {
      const payload: Record<string, string> = {};
      if (currentLocale && (currentLocale === 'en' || currentLocale === 'zh')) {
        payload.locale = currentLocale;
      }
      if (userTimezone) {
        payload.timezone = userTimezone;
      }
      // 🔧 F5 fix (Round 101): Skip if already in-flight OR already completed for this user.
      //   The completed-set guard prevents the second POST that fires when the first is
      //   aborted by React Strict Mode cleanup or onAuthStateChange firing twice.
      if (_localeSyncInFlightUserId !== user.id && !_localeSyncCompletedUserIds.has(user.id)) {
        _localeSyncInFlightUserId = user.id;
        _localeSyncCompletedUserIds.add(user.id);
        // 🔧 ARCH fix (Round 39 — raw fetch → apiFetchVoid, 加 logger.warn)
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        apiFetchVoid('/api/user/locale', {
          method: 'POST',
          body: payload,
        }).catch(err => logger.warn('[Auth] Failed to sync locale/timezone:', err))
          .finally(() => {
            if (_localeSyncInFlightUserId === user.id) {
              _localeSyncInFlightUserId = null;
            }
          });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [user?.id, configured]);

  // Client-side route protection (works with static export)
  // ✅ 改造：不再强制未登录用户跳转到登录页，允许浏览 App Demo
  // 只在已登录用户访问 auth 页面时重定向到首页
  useEffect(() => {
    if (!configured || loading) return;

    const isAuthPage = pathname?.startsWith('/auth/login') || pathname?.startsWith('/auth/signup');

    // 已登录用户访问 login/signup 页面 → 重定向到首页
    if (user && isAuthPage) {
      router.replace('/');
    }
    // 未登录用户 → 不再强制跳转到登录页，允许浏览 Demo
  }, [user, loading, pathname, router, configured]);

  // 🔧 ARCH fix (Round 4 React C-2): useCallback signOut 防止每次 render 新建函数
  const signOut = useCallback(async () => {
    if (!configured) return;
    try {
      // Use the singleton client — scope:global signs out ALL tabs/windows
      const client = createClient();
      if (!client) return;

      // 🔧 N55 fix: Sign Out 前把 theme/locale 保存到 user_metadata（防 localStorage 被清空）
      try {
        const theme = localStorage.getItem('symy-theme') || 'dark';
        const locale = localStorage.getItem('symy-locale') || 'en';
        await client.auth.updateUser({ data: { theme, locale } });
      } catch (err) {
        // safe to ignore: auth.updateUser failure — non-critical, doesn't block signOut
        logger.warn('[Auth] Failed to sync theme/locale to user metadata:', err);
      }

      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) {
        logger.error('[Auth] signOut returned error:', error.message);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.error('[Auth] signOut threw:', err);
    } finally {
      // Belt-and-suspenders: manually clear all Supabase auth cookies.
      // If signOut() threw (e.g. network error), _removeSession is skipped
      // and cookies survive. Force-clear them from document.cookie.
      clearSupabaseCookies();
      setUser(null);
      // PostHog: reset user identity on logout
      resetUser();
      _agentEnsuredUserId = null;
      _agentEnsureInFlightUserId = null;
      // 🔧 F5 fix (Round 101): Reset locale sync lock on signOut too.
      _localeSyncInFlightUserId = null;
      // 🔧 F5 fix (Round 101): Clear completed set so locale re-syncs on next login.
      _localeSyncCompletedUserIds.clear();
      // 🔧 PM3-P1-3 fix: Sign out 后跳转到 login 页 (而非首页 Demo)
      //   旧代码: 跳转到 '/' (首页 Demo 模式) → 用户分不清是否登出成功
      //   新代码: 跳转到 '/auth/login?from=signout' → login 页显示 "You've been signed out" toast
      //   需求: PM3-P1-3 验收标准 "Sign out 后跳转 login 页"
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login?from=signout';
      }
    }
  }, [configured]);

  // 🔧 ARCH fix (Round 4 React C-2): useMemo context value 防止每次 render 新建对象
  //    旧代码 value={{ user, loading, signOut }} → 每次 render 新对象 → 所有 useAuth() 消费者重渲染
  const contextValue = useMemo(() => ({ user, loading, signOut }), [user, loading, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
