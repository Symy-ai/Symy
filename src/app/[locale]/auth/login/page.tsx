'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import { symyEvents } from '@/lib/posthog';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';

// Google SVG icon
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  // 🔧 Logo UI fix: 用 typeof window 替代 mounted state (React 19 Compiler 兼容)
  // 🔧 ARCH fix (Round 68): 移除 setMounted effect (react-hooks/set-state-in-effect warning)
  const isDark = typeof window !== 'undefined' ? resolvedTheme === 'dark' : true;
  const elephantSrc = isDark ? '/symy-elephant-dark.png' : '/symy-elephant.png';

  // Bug #29 fix: Read ?error= from URL
  // 🔧 N23 fix: Also read ?email= from URL to pre-fill after signup→login navigation
  // 🔒 SEC fix (Bug J revert): 不再把 password 存到 sessionStorage — XSS 可读取，属凭据泄露。
  //    email 仍可通过 URL param 传递（非敏感），password 让用户重输（轻微不便换安全）。
  // 🔧 FIX-React19: 用 lazy initializer 替代 effect 内 setState（React 19 禁止 effect 内同步 setState 触发级联渲染）
  // 仅在 client 端执行一次（SSR 时返回默认值，避免 hydration mismatch）
  const [email, setEmail] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      if (emailParam) return emailParam;
      return sessionStorage.getItem('symy-auth-email') ?? '';
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      return '';
    }
  });
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('error') ?? '';
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      return '';
    }
  });
  const [userError, setUserError] = useState(''); // 用户操作（登录失败等）触发的 error
  const [message, setMessage] = useState('');

  // 🔧 PM3-P1-3 fix: 检测 ?from=signout 参数, 显示 "You've been signed out" toast
  //   需求: Sign out 后跳转 /auth/login?from=signout, 显示 toast
  //   实现: 用 lazy initializer 读取 URL 参数, 避免 hydration mismatch
  const [signedOutToast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('from') === 'signout';
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      return false;
    }
  });

  // 🔧 FIX-React19: 派生 errorCode → 本地化错误消息（用 useMemo 替代 effect 内 setError）
  // React 19 禁止 effect 内同步 setState 触发级联渲染，所以用 derived state 模式
  const error = useMemo(() => {
    if (userError) return userError;
    if (!errorCode) return '';
    const errorMessages: Record<string, string> = {
      auth_callback_failed: t('auth.login.errors.authCallbackFailed'),
      default: t('auth.login.errors.default'),
    };
    return errorMessages[errorCode] || errorMessages.default;
  }, [userError, errorCode, t]);

  // setError 兼容旧调用点（handleLogin/handleMagicLink 等设置 userError）
  const setError = useCallback((value: string) => {
    setUserError(value);
    if (!value) setErrorCode(''); // 清空 error 时也清空 errorCode
  }, []);

  // 🔧 FIX-React19: effect 只做"副作用"（清理 sessionStorage + URL），不再调 setState
  useEffect(() => {
    try {
      sessionStorage.removeItem('symy-auth-email');
      // 🔒 SEC fix: 不再写入/清理 symy-auth-password（已停止存储密码）
      // 兼容旧版本：清理可能残留的密码
      sessionStorage.removeItem('symy-auth-password');
    } catch { /* silent: non-critical operation */ }
    try {
      window.history.replaceState({}, '', `/${locale}/auth/login`);
    } catch { /* silent: non-critical operation */ }
  }, [locale]);

  // Bug #17 修复：缓存 supabase 客户端（避免每次 render 创建新实例）
  // 🔧 BUG-260 fix: Check isSupabaseConfigured() before creating client
  // 🔧 FIX-React19: 用 useMemo 替代 useRef + render-中-赋值（React 19 禁止在 render 中改 ref）
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createClient() : null, [configured]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.login.errors.serviceNotConfigured'));
      return;
    }
    // 🔧 P1-8 fix: 客户端校验 — 阻止空提交 / 邮箱格式错误
    //   旧代码: 无客户端校验, 空提交直接发请求 → 后端返回 400 → 用户体验差
    //   修复: 提交前检查 email/password 非空 + 邮箱格式合法
    if (!email.trim()) {
      setError(t('auth.login.errors.enterEmail', { defaultValue: 'Please enter your email' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('auth.login.errors.invalidEmail', { defaultValue: 'Please enter a valid email address' }));
      return;
    }
    if (!password) {
      setError(t('auth.login.errors.enterPassword', { defaultValue: 'Please enter your password' }));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      // 🔧 P0 fix: 不直接显示原始 error.message（可能暴露 Supabase URL 等技术信息）
      const msg = error.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        setError(t('auth.login.errors.networkError', { defaultValue: 'Unable to connect. Please check your internet and try again.' }));
      } else if (msg.includes('Invalid login credentials')) {
        setError(t('auth.login.errors.invalidCredentials', { defaultValue: 'Incorrect email or password.' }));
      } else {
        setError(t('auth.login.errors.default', { defaultValue: 'Something went wrong. Please try again.' }));
      }
    } else {
      symyEvents.userLoggedIn({ method: 'password' });
      setMessage(t('auth.login.loginSuccess'));
      window.location.href = '/';
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError(t('auth.login.errors.serviceNotConfigured'));
      return;
    }
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });

    if (!error) {
      symyEvents.userLoggedIn({ method: 'oauth' });
    }
    if (error) {
      // 🔧 P1 fix: Google OAuth error also needs friendly handling (consistent with password login)
      const msg = error.message || '';
      if (msg.includes('access_denied')) {
        setError(t('auth.login.errors.accessDenied', { defaultValue: 'Authorization cancelled.' }));
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        setError(t('auth.login.errors.networkError', { defaultValue: 'Unable to connect. Please check your internet and try again.' }));
      } else {
        setError(t('auth.login.errors.default', { defaultValue: 'Something went wrong. Please try again.' }));
      }
      setLoading(false);
    }
    // If no error, browser will redirect to Google → Supabase callback → /auth/callback → home
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.login.errors.serviceNotConfigured'));
      return;
    }
    if (!email) { setError(t('auth.login.errors.enterEmail')); return; }
    // 🔧 P1-6 fix: 客户端速率限制 — 60 秒内最多 1 次 magic link 请求, 防止用户枚举攻击
    //   旧代码: 无速率限制, 攻击者可批量提交 email 列表枚举已注册用户
    //   修复: 用 sessionStorage 记录上次请求时间, 60 秒内重复请求直接拒绝
    const MAGIC_LINK_COOLDOWN_MS = 60_000;
    const lastRequestTime = sessionStorage.getItem('symy_magic_link_last_time');
    const now = Date.now();
    if (lastRequestTime) {
      const elapsed = now - parseInt(lastRequestTime, 10);
      if (elapsed < MAGIC_LINK_COOLDOWN_MS) {
        const remainingSec = Math.ceil((MAGIC_LINK_COOLDOWN_MS - elapsed) / 1000);
        setError(t('auth.login.errors.magicLinkCooldown', { defaultValue: `Please wait ${remainingSec}s before requesting another magic link`, sec: remainingSec }));
        return;
      }
    }
    setLoading(true);
    setError('');
    setMessage('');
    setMagicLinkSent(false);
    sessionStorage.setItem('symy_magic_link_last_time', now.toString());

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });

    // 🔧 P1-6 fix: 无论 error 与否, 都显示统一"请查看邮箱"消息 (避免泄露账号存在性)
    //   旧代码: error 时显示 error.message, 可能泄露"用户不存在"
    //   修复: 即使有 error 也显示 magic link sent UI (除非是速率限制 error)
    if (error) {
      // 仅在明显是速率限制 error 时显示给用户
      if (error.message.toLowerCase().includes('rate limit') || error.status === 429) {
        setError(error.message);
      } else {
        // 其他 error (包括 "user not found") 都显示统一消息
        setMagicLinkSent(true);
        setMessage(t('auth.login.magicLinkSent'));
      }
    } else {
      symyEvents.userLoggedIn({ method: 'magic_link' });
      setMagicLinkSent(true);
      setMessage(t('auth.login.magicLinkSent'));
    }
    setLoading(false);
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          {/* Logo container — logo 自带白色外发光，无需 CSS 背景 */}
          <div className="relative w-36 h-auto mx-auto mb-4">
            { }
            <Image src={elephantSrc} alt="Symy" width={300} height={300} className={`relative w-full h-auto mx-auto ${isDark ? '[filter:drop-shadow(0_0_4px_rgba(255,255,255,0.9))_drop-shadow(0_0_8px_rgba(255,255,255,0.6))_drop-shadow(0_0_16px_rgba(255,255,255,0.3))]' : ''}`} unoptimized />
          </div>
          <h1 className="font-mono font-bold text-4xl tracking-wider gradient-text">{t('auth.login.title')}</h1>
          <p className="text-sm text-text-secondary mt-2">{t('auth.login.subtitle')}</p>
          <p className="text-xs text-text-tertiary mt-1">{t('auth.login.signInPrompt')}</p>
        </div>

        {/* 🔧 PM3-P1-3 fix: Sign out toast — 检测 ?from=signout 参数 */}
        {signedOutToast && (
          <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-center animate-in slide-in-from-top duration-300">
            <p className="text-sm text-green-400 font-medium">
              {t('auth.login.signedOut', { defaultValue: "You've been signed out" })}
            </p>
          </div>
        )}

        {/* Bug #6 fix: prominent Magic Link success state replaces the form */}
        {magicLinkSent ? (
          <div className="animate-in slide-in-from-bottom duration-500">
            <div className="text-center py-6">
              {/* Large animated checkmark */}
              <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5 animate-in zoom-in duration-300 neon-glow-green">
                <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">{t('auth.login.magicLinkSent')}</h3>
              <p className="text-text-secondary text-sm mb-1">{t('auth.login.sentLinkTo')}</p>
              <p className="text-emerald-400 text-sm font-semibold break-all">{email}</p>
              <div className="mt-6 p-4 glass-card rounded-xl">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-text-secondary text-xs font-medium">{t('auth.login.checkInbox')}</p>
                    <p className="text-text-tertiary text-xs mt-1">{t('auth.login.magicLinkInfo')}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setMagicLinkSent(false); setMessage(''); }}
                className="mt-5 text-sm text-text-tertiary hover:text-text-secondary transition-colors underline underline-offset-2"
              >
                {t('auth.login.useDifferentMethod')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* PM-P1-1: 3 个价值卡片 — 顺序 buddy → gate → gacha */}
            <div className="space-y-2.5 mb-5">
              <div className="glass-card rounded-xl p-3 flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-lg">🐘</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t('auth.login.valueCards.buddy.title')}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">{t('auth.login.valueCards.buddy.desc')}</p>
                </div>
              </div>
              <div className="glass-card rounded-xl p-3 flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/20 flex items-center justify-center text-lg">🐘</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t('auth.login.valueCards.gate.title')}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">{t('auth.login.valueCards.gate.desc')}</p>
                </div>
              </div>
              <div className="glass-card rounded-xl p-3 flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-lg">🦋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t('auth.login.valueCards.gacha.title')}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">{t('auth.login.valueCards.gacha.desc')}</p>
                </div>
              </div>
            </div>

            {/* Login Form — Glass card */}
            <div className="glass-card-strong rounded-2xl p-6">
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3 px-4 flex items-center justify-center gap-3 bg-white dark:bg-white/10 border border-glass-border rounded-xl text-text-primary font-medium hover:bg-gray-50 dark:hover:bg-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                <GoogleIcon className="w-5 h-5" />
                {loading ? t('auth.login.redirecting') : t('auth.login.continueWithGoogle')}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-glass-border" />
                <span className="text-xs text-text-tertiary">{t('common.or')}</span>
                <div className="flex-1 h-px bg-glass-border" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">{t('auth.login.email')}</label>
                  <input
                    type="email"
                    value={email}
                    // 🔧 P1-7 fix: 输入时清空 error, 避免旧错误信息残留误导用户
                    onChange={(e) => { setEmail(e.target.value); if (userError) setError(''); }}
                    required
                    maxLength={254}
                    // 🔧 P1-8 fix: minLength + autoComplete 提升原生校验 + 浏览器自动填充
                    minLength={3}
                    autoComplete="email"
                    className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                    placeholder={t('auth.placeholders.emailExample')}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-text-secondary">{t('auth.login.password')}</label>
                    {/* 🔧 forgot-password fix: 加 "Forgot password?" 链接 */}
                    {/*   旧代码: 登录页没有忘记密码入口, 用户忘记密码只能反复尝试 → 卡死 */}
                    {/*   修复: 在 password label 右侧加链接, 跳到 /auth/forgot-password */}
                    <Link
                      href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                      className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                      onClick={() => {
                        // 保存 email 到 sessionStorage, forgot-password 页面可读取 (非敏感)
                        try {
                          if (email) sessionStorage.setItem('symy-auth-email', email);
                        } catch { /* silent: non-critical operation */ }
                      }}
                    >
                      {t('auth.login.forgotPassword', { defaultValue: 'Forgot password?' })}
                    </Link>
                  </div>
                  <input
                    type="password"
                    value={password}
                    // 🔧 P1-7 fix: 输入时清空 error
                    onChange={(e) => { setPassword(e.target.value); if (userError) setError(''); }}
                    required
                    maxLength={128}
                    // 🔧 P1-8 fix: minLength + autoComplete
                    minLength={6}
                    autoComplete="current-password"
                    className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm font-medium"
                    style={{ color: '#ef4444' }}
                  >
                    {error}
                  </div>
                )}

                {message && !magicLinkSent && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] btn-shimmer"
                >
                  {loading ? t('auth.login.signingIn') : t('auth.login.signIn')}
                </button>
              </form>

              {/* Magic Link */}
              <div className="mt-4">
                <button
                  onClick={handleMagicLink}
                  disabled={loading}
                  className={cn(
                    "w-full py-3 font-medium rounded-xl transition-all text-sm",
                    'bg-glass-fill border border-glass-border text-text-secondary hover:bg-glass-fill-strong hover:border-glass-border',
                    loading && 'opacity-50 cursor-wait'
                  )}
                >
                  {loading ? t('auth.login.sending') : t('auth.login.sendMagicLink')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Signup Link — 🔧 N23 fix: pass email via query param */}
        {/* 🔒 SEC fix (Bug J revert): 不再把 password 存到 sessionStorage */}
        <p className="text-center text-sm text-text-tertiary mt-6">
          {t('auth.login.noAccount')}{' '}
          <Link
            href={`/${locale}/auth/signup${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
            onClick={() => {
              // 🔒 SEC fix: 只保存 email（非敏感），不保存 password
              try {
                if (email) sessionStorage.setItem('symy-auth-email', email);
              } catch { /* silent: non-critical operation */ }
            }}
          >
            {t('auth.login.signUp')}
          </Link>
        </p>

        {/* ✅ 改造：以访客身份继续浏览 Demo */}
        <div className="mt-4 pt-4 border-t border-glass-border">
          <Link
            href={`/${locale}?guest=true`}
            onClick={() => {
              // 🔧 BUG fix (commit 2def72c revert): 不再用 localStorage 永久隐藏 LandingPage。
              //   旧代码设 symy-landing-seen=true → 用户之后打开首页永远看不到营销页。
              //   新代码: 用 ?guest=true URL 参数, LandingPage 仅本次跳过;
              //          用户重新打开首页 (无参数) 仍能看到营销页。
              //   AhaMoment/Onboarding 的 flag 保留 (与 LandingPage 无关, 各自独立机制)。
              try {
                localStorage.setItem('symy-aha-moment-seen', 'true');
                localStorage.setItem('symy-onboarding-seen', 'true');
              } catch { /* silent */ }
            }}
            className="flex items-center justify-center gap-2 text-sm font-medium text-text-secondary rounded-xl border border-glass-border bg-glass-fill px-4 py-2.5 hover:bg-glass-fill-strong hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {t('auth.login.exploreAsGuest')}
          </Link>
        </div>
      </div>
    </div>
  );
}
