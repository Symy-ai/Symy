'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { useTheme } from 'next-themes';

/**
 * Forgot Password page — Supabase reset password email flow
 *
 * 流程:
 * 1. 用户输入 email
 * 2. 调用 supabase.auth.resetPasswordForEmail(email, { redirectTo })
 *    Supabase 发送一封带 token 的邮件到用户邮箱
 * 3. 用户点邮件链接 → 跳到 /auth/callback?type=recovery → /auth/reset-password
 *
 * 安全考虑:
 * - 不暴露账号是否存在 (与 magic link 一致)
 * - 60 秒冷却防枚举攻击
 * - 统一成功消息（无论 email 是否注册）
 */
export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isDark = typeof window !== 'undefined' ? resolvedTheme === 'dark' : true;
  const elephantSrc = isDark ? '/symy-elephant-dark.png' : '/symy-elephant.png';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // 冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createClient() : null, [configured]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.forgotPassword.errors.serviceNotConfigured', { defaultValue: 'Service is not configured. Please try again later.' }));
      return;
    }
    if (!email.trim()) {
      setError(t('auth.forgotPassword.errors.enterEmail', { defaultValue: 'Please enter your email' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('auth.forgotPassword.errors.invalidEmail', { defaultValue: 'Please enter a valid email address' }));
      return;
    }
    if (cooldown > 0) {
      setError(t('auth.forgotPassword.errors.cooldown', { sec: cooldown, defaultValue: `Please wait ${cooldown}s before trying again` }));
      return;
    }

    setLoading(true);
    setError('');

    const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    // 🔒 不暴露账号是否存在 — 统一显示"如果账号存在，邮件已发送"
    // 与 magic link 一致的安全策略
    if (resetError) {
      // 仅在明显是速率限制 error 时显示给用户
      if (resetError.message.toLowerCase().includes('rate limit') || resetError.status === 429) {
        setError(resetError.message);
      } else {
        // 其他 error (包括 "user not found") 都显示统一消息
        setSent(true);
      }
    } else {
      setSent(true);
      setCooldown(60);
    }
    setLoading(false);
  }, [supabase, email, cooldown, t]);

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative w-36 h-auto mx-auto mb-4">
            <Image
              src={elephantSrc}
              alt="Symy"
              width={300}
              height={300}
              className={`relative w-full h-auto mx-auto ${isDark ? '[filter:drop-shadow(0_0_4px_rgba(255,255,255,0.9))_drop-shadow(0_0_8px_rgba(255,255,255,0.6))_drop-shadow(0_0_16px_rgba(255,255,255,0.3))]' : ''}`}
              unoptimized
            />
          </div>
          <h1 className="font-mono font-bold text-4xl tracking-wider gradient-text">
            {t('auth.forgotPassword.title', { defaultValue: 'Reset Password' })}
          </h1>
          <p className="text-sm text-text-secondary mt-2">
            {t('auth.forgotPassword.subtitle', { defaultValue: 'We\'ll email you a secure link to reset your password' })}
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card-strong rounded-2xl p-6">
          {sent ? (
            <div className="animate-in slide-in-from-bottom duration-500">
              <div className="text-center py-4">
                {/* Animated checkmark */}
                <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5 animate-in zoom-in duration-300 neon-glow-green">
                  <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  {t('auth.forgotPassword.sentTitle', { defaultValue: 'Check your inbox' })}
                </h3>
                <p className="text-text-secondary text-sm mb-1">
                  {t('auth.forgotPassword.sentTo', { defaultValue: 'If an account exists for:' })}
                </p>
                <p className="text-emerald-400 text-sm font-semibold break-all mb-4">{email}</p>
                <div className="mt-4 p-4 glass-card rounded-xl text-left">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-text-secondary text-xs font-medium">
                        {t('auth.forgotPassword.info', { defaultValue: 'Click the link in the email to set a new password. The link expires in 1 hour.' })}
                      </p>
                      <p className="text-text-tertiary text-xs mt-1">
                        {t('auth.forgotPassword.spamHint', { defaultValue: 'Didn\'t get it? Check your spam folder.' })}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="mt-5 text-sm text-text-tertiary hover:text-text-secondary transition-colors underline underline-offset-2"
                >
                  {t('auth.forgotPassword.tryAgain', { defaultValue: 'Use a different email' })}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t('auth.login.email', { defaultValue: 'Email' })}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  required
                  maxLength={254}
                  minLength={3}
                  autoComplete="email"
                  className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                  placeholder={t('auth.placeholders.emailExample', { defaultValue: 'you@example.com' })}
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

              <button
                type="submit"
                disabled={loading || cooldown > 0}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] btn-shimmer"
              >
                {loading
                  ? t('auth.forgotPassword.sending', { defaultValue: 'Sending...' })
                  : cooldown > 0
                    ? t('auth.forgotPassword.cooldownButton', { sec: cooldown, defaultValue: `Wait ${cooldown}s` })
                    : t('auth.forgotPassword.sendResetLink', { defaultValue: 'Send reset link' })}
              </button>
            </form>
          )}
        </div>

        {/* Back to login */}
        <p className="text-center text-sm text-text-tertiary mt-6">
          <Link
            href={`/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium inline-flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M10 12L6 8l4-4v8z" />
            </svg>
            {t('auth.forgotPassword.backToLogin', { defaultValue: 'Back to sign in' })}
          </Link>
        </p>
      </div>
    </div>
  );
}
