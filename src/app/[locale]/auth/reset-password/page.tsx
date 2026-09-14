'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/provider';
import { useTheme } from 'next-themes';
import { logger } from '@/lib/logger';

/**
 * Reset Password page — 用户从邮件点链接后落到这里
 *
 * 流程:
 * 1. Supabase recovery 链接 → /auth/callback?type=recovery → /auth/reset-password
 * 2. 此时 supabase 客户端已有 session (exchangeCodeForSession 已完成)
 * 3. 用户输入新密码 → supabase.auth.updateUser({ password }) 更新密码
 * 4. 成功后跳到首页
 *
 * 安全考虑:
 * - 密码最少 6 字符 (Supabase 默认)
 * - 两次输入必须一致
 * - 提交期间禁用按钮
 * - 错误统一显示，不暴露 session 状态
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = typeof window !== 'undefined' ? resolvedTheme === 'dark' : true;
  const elephantSrc = isDark ? '/symy-elephant-dark.png' : '/symy-elephant.png';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // 验证 session 是否存在 (recovery flow 必须有 session)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const configured = isSupabaseConfigured();
        if (!configured) {
          setHasSession(false);
          return;
        }
        const client = createClient();
        if (!client) {
          setHasSession(false);
          return;
        }
        const { data } = await client.auth.getSession();
        if (!cancelled) {
          setHasSession(!!data.session);
        }
      } catch (err) {
        logger.warn('[ResetPassword] Failed to check session:', err);
        if (!cancelled) setHasSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createClient() : null, [configured]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.forgotPassword.errors.serviceNotConfigured', { defaultValue: 'Service is not configured. Please try again later.' }));
      return;
    }
    if (!password) {
      setError(t('auth.resetPassword.errors.enterPassword', { defaultValue: 'Please enter a new password' }));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.resetPassword.errors.tooShort', { defaultValue: 'Password must be at least 6 characters' }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.signup.errors.passwordsNoMatch', { defaultValue: 'Passwords do not match' }));
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // 成功 — 显示成功提示后跳转
    setSuccess(true);
    setLoading(false);
    setTimeout(() => {
      router.push('/');
    }, 2500);
  }, [supabase, password, confirmPassword, router, t]);

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
            {t('auth.resetPassword.title', { defaultValue: 'New Password' })}
          </h1>
          <p className="text-sm text-text-secondary mt-2">
            {t('auth.resetPassword.subtitle', { defaultValue: 'Choose a new password for your account' })}
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-card-strong rounded-2xl p-6">
          {/* Session 还没加载 */}
          {hasSession === null && (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          )}

          {/* 无 session — 链接已失效或被用过 */}
          {hasSession === false && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t('auth.resetPassword.expiredTitle', { defaultValue: 'Link expired or invalid' })}
              </h3>
              <p className="text-text-secondary text-sm mb-6">
                {t('auth.resetPassword.expiredDesc', { defaultValue: 'This password reset link may have been used or expired. Please request a new one.' })}
              </p>
              <Link
                href="/auth/forgot-password"
                className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm hover:from-emerald-400 hover:to-green-500 transition-all active:scale-95"
              >
                {t('auth.resetPassword.requestNewLink', { defaultValue: 'Request new link' })}
              </Link>
            </div>
          )}

          {/* 成功 */}
          {success && hasSession === true && (
            <div className="animate-in slide-in-from-bottom duration-500">
              <div className="text-center py-4">
                <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5 animate-in zoom-in duration-300 neon-glow-green">
                  <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  {t('auth.resetPassword.successTitle', { defaultValue: 'Password updated' })}
                </h3>
                <p className="text-text-secondary text-sm">
                  {t('auth.resetPassword.successDesc', { defaultValue: 'Redirecting you to Symy...' })}
                </p>
              </div>
            </div>
          )}

          {/* 表单 */}
          {hasSession === true && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t('auth.resetPassword.newPassword', { defaultValue: 'New password' })}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                  placeholder="••••••••"
                />
                <p className="text-[11px] text-text-tertiary mt-1">
                  {t('auth.resetPassword.passwordHint', { defaultValue: 'At least 6 characters' })}
                </p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t('auth.resetPassword.confirmPassword', { defaultValue: 'Confirm new password' })}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(''); }}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-glass-fill border border-glass-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 transition-all"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] btn-shimmer"
              >
                {loading
                  ? t('auth.resetPassword.updating', { defaultValue: 'Updating...' })
                  : t('auth.resetPassword.updatePassword', { defaultValue: 'Update password' })}
              </button>
            </form>
          )}
        </div>

        {/* Back to login */}
        <p className="text-center text-sm text-text-tertiary mt-6">
          <Link
            href="/auth/login"
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
