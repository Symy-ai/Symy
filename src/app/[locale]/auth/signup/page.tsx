'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import { symyEvents } from '@/lib/posthog';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  // 🔧 Logo UI fix: 用 typeof window 替代 mounted state (React 19 Compiler 兼容)
  // 🔧 ARCH fix (Round 68): 移除 setMounted effect (react-hooks/set-state-in-effect warning)
  const isDark = typeof window !== 'undefined' ? resolvedTheme === 'dark' : true;
  const elephantSrc = isDark ? '/symy-elephant-dark.png' : '/symy-elephant.png';

  // 🔧 N23 fix: Read ?email= from URL to pre-fill after login→signup navigation
  // 🔒 SEC fix (Bug J revert): 不再把 password 存到 sessionStorage — XSS 可读取，属凭据泄露。
  // 🔧 FIX-React19: 用 lazy initializer 替代 effect 内 setState（React 19 禁止 effect 内同步 setState 触发级联渲染）
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // 🔧 2026-07-15 P1-A03 fix: ToS/Privacy 同意勾选 (方案 C — 文字声明 + 单勾选)
  //   产品处理用户消费数据 + 心理反思内容, 属 GDPR 敏感数据, 需明确同意
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // 🔧 Bug 10 fix: 实时校验密码匹配 + 长度 — 旧代码只在 submit 时校验, 用户填完点提交才看到错误
  //   根因修复: 用 useMemo 派生校验状态, onChange 时实时显示 + 按钮 disabled
  const passwordValidationError = useMemo(() => {
    if (!confirmPassword) return ''; // 未输入 confirm 时不显示
    if (password !== confirmPassword) {
      return t('auth.signup.errors.passwordsNoMatch');
    }
    if (password.length < 6) {
      return t('auth.signup.errors.passwordTooShort');
    }
    return '';
  }, [password, confirmPassword, t]);
  const isPasswordValid = !passwordValidationError && password.length >= 6 && password === confirmPassword;

  // 🔧 P2-7 fix (2026-07-11): 实时校验 email 格式 — 旧代码只有浏览器原生 type="email" 校验
  //   原生校验只检查是否有 "@", 不检查 "test@" (无域名) 或 "test@example" (无 TLD) 等无效格式
  //   根因修复: 用 useMemo 派生 email 校验状态, onChange 时实时显示 + 按钮 disabled
  const emailValidationError = useMemo(() => {
    if (!email) return ''; // 未输入时不显示
    // 标准 email 正则: 必须有 @ + 域名 + TLD (至少 2 字符)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      return t('auth.signup.errors.emailInvalid', { defaultValue: 'Please enter a valid email address' });
    }
    return '';
  }, [email, t]);
  const isEmailValid = !emailValidationError && email.length > 0;

  // 🔧 FIX-React19: 把 URL/sessionStorage 读取从 effect 改成 lazy initializer 后，
  // 这个 effect 只负责"副作用"——清理 sessionStorage + URL。
  // 不再调 setState 来"初始化"，避免 React 19 Compiler 警告。
  useEffect(() => {
    try {
      sessionStorage.removeItem('symy-auth-email');
      // 🔒 SEC fix: 不再写入/清理 symy-auth-password（已停止存储密码）
      // 兼容旧版本：清理可能残留的密码
      sessionStorage.removeItem('symy-auth-password');
    } catch { /* silent: non-critical operation */ }
    try {
      if (window.location.search) {
        window.history.replaceState({}, '', `/${locale}/auth/signup`);
      }
    } catch { /* silent: non-critical operation */ }
  }, [locale]);

  // Bug #17 修复：缓存 supabase 客户端（避免每次 render 创建新实例）
  // 🔧 BUG-260 fix: Check isSupabaseConfigured() before creating client
  // 🔧 FIX-React19: 用 useMemo 替代 useRef + render-中-赋值（React 19 禁止在 render 中改 ref）
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createClient() : null, [configured]);

  const handleGoogleSignup = async () => {
    if (!supabase) {
      setError(t('auth.signup.errors.serviceNotConfigured'));
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

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // If no error, browser will redirect to Google → Supabase callback → /auth/callback → home
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.signup.errors.serviceNotConfigured'));
      return;
    }
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError(t('auth.signup.errors.passwordsNoMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.signup.errors.passwordTooShort'));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      symyEvents.userSignedUp({ method: 'email' });
      setMessage(t('auth.signup.checkEmailConfirm'));
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
          <h1 className="font-mono font-bold text-4xl tracking-wider gradient-text">{t('auth.signup.title')}</h1>
          <p className="text-sm text-text-secondary mt-2">{t('auth.signup.subtitle')}</p>
          <p className="text-xs text-text-tertiary mt-1">{t('auth.signup.createAccount')}</p>
        </div>

        {/* Signup Form — Glass card */}
        <div className="glass-card-strong rounded-2xl p-6">
          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full py-3 px-4 flex items-center justify-center gap-3 bg-white dark:bg-white/10 border border-glass-border rounded-xl text-text-primary font-medium hover:bg-gray-50 dark:hover:bg-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <GoogleIcon className="w-5 h-5" />
            {loading ? t('auth.signup.redirecting') : t('auth.signup.continueWithGoogle')}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-glass-border" />
            <span className="text-xs text-text-tertiary">{t('common.or')}</span>
            <div className="flex-1 h-px bg-glass-border" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('auth.signup.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                className={`w-full px-4 py-3 bg-glass-fill border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 transition-all ${
                  emailValidationError
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-glass-border focus:border-emerald-400/50 focus:ring-emerald-400/30'
                }`}
                placeholder={t('auth.placeholders.emailExample')}
              />
              {/* 🔧 P2-7 fix: 实时显示 email 格式错误 */}
              {emailValidationError && (
                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  {emailValidationError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('auth.signup.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={128}
                className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                placeholder={t('auth.placeholders.passwordMinLength')}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('auth.signup.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                maxLength={128}
                className={`w-full px-4 py-3 bg-glass-fill border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 transition-all ${
                  passwordValidationError
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-glass-border focus:border-emerald-400/50 focus:ring-emerald-400/30'
                }`}
                placeholder="••••••••"
              />
              {/* 🔧 Bug 10 fix: 实时显示密码不匹配 / 长度不足错误 */}
              {passwordValidationError && (
                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  {passwordValidationError}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm font-medium" style={{ color: '#ef4444' }}>
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
                {message}
              </div>
            )}

            {/* 🔧 2026-07-15 P1-A03 fix: ToS/Privacy 同意勾选 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none py-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-glass-border bg-glass-fill text-emerald-500 focus:ring-emerald-400/30 focus:ring-offset-0 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-text-tertiary leading-relaxed">
                {t('auth.signup.agreeToTermsPrefix', { defaultValue: 'By signing up, you agree to our ' })}
                <a
                  href={`/${locale}/legal/terms`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  {t('auth.signup.termsOfService', { defaultValue: 'Terms of Service' })}
                </a>
                {' '}
                {t('auth.signup.andConjunction', { defaultValue: 'and' })}
                {' '}
                <a
                  href={`/${locale}/legal/privacy`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  {t('auth.signup.privacyPolicy', { defaultValue: 'Privacy Policy' })}
                </a>
              </span>
            </label>

            <p className="text-xs text-emerald-400/90 text-center font-medium">
              {t('auth.signup.guardianPromise')}
            </p>

            <button
              type="submit"
              disabled={loading || !isPasswordValid || !isEmailValid || !agreedToTerms}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] btn-shimmer"
            >
              {loading ? t('auth.signup.creatingAccount') : t('auth.signup.signUp')}
            </button>
          </form>
        </div>

        {/* Login Link — 🔧 BUG-247 fix: 同时使用 Link 和 router.push 确保 SPA 导航生效 */}
        {/* 🔧 N23 fix: Pass email via query param so login page can pre-fill it */}
        {/* 🔧 Bug J fix: 同时保存 email/password 到 sessionStorage，切换后恢复 */}
        <p className="text-center text-sm text-text-tertiary mt-6">
          {t('auth.signup.alreadyHaveAccount')}{' '}
          <Link
            href={`/${locale}/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            onClick={(e) => {
              e.preventDefault();
              // 🔒 SEC fix (Bug J revert): 只保存 email（非敏感），不保存 password
              try {
                if (email) sessionStorage.setItem('symy-auth-email', email);
              } catch { /* silent: non-critical operation */ }
              router.push(`/${locale}/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`);
            }}
            className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
          >
            {t('auth.signup.signIn')}
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
            {t('auth.signup.exploreAsGuest')}
          </Link>
        </div>
      </div>
    </div>
  );
}
