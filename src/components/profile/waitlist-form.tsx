'use client';

/**
 * WaitlistForm — 候补名单表单（可复用）
 *
 * 🔧 BUG-2 fix: 从 PremiumCard 提取的候补名单逻辑
 *
 * 🐘 batch7-c: 文案过守护口径 — 候补 = 预订一个更尽职的守护伙伴;
 *    props 接口与提交行为零变化 (纯文案层改动)
 *
 * 功能:
 * - 邮箱输入 + 邮箱校验
 * - POST /api/premium/waitlist
 * - 成功后显示 ✓ 并 3 秒后自动重置
 *
 * 复用位置:
 * 1. PremiumCard — "更尽职的守护伙伴" 区域的 "加入候补名单" 按钮
 * 2. EmailConnectionSetting — "邮箱监控（VIP内测）" 区域下方
 *
 * 使用:
 * <WaitlistForm />                      // 默认展开表单（用于 EmailConnectionSetting）
 * <WaitlistForm mode="button" />        // 先显示按钮，点击后展开表单（用于 PremiumCard）
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/components/auth/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

interface WaitlistFormProps {
  /**
   * 'form': 直接显示表单输入框（用于 EmailConnectionSetting VIP 区域）
   * 'button': 先显示一个 "Join waitlist" 按钮，点击后展开表单（用于 PremiumCard）
   */
  mode?: 'form' | 'button';
}

export function WaitlistForm({ mode = 'form' }: WaitlistFormProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(mode === 'form');
  const [email, setEmail] = useState(user?.email || '');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg(t('profile.waitlistInvalidEmail', { defaultValue: 'Please enter a valid email' }));
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      await apiFetch('/api/premium/waitlist', {
        method: 'POST',
        body: { email: trimmed },
      });
      setStatus('success');

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setOpen(mode === 'form');
        setStatus('idle');
        if (mode === 'button') setEmail('');
      }, 3000);
    } catch (err) {
      logger.warn('[WaitlistForm] Submit failed:', err);
      setErrorMsg(t('profile.waitlistSubmitFailed', { defaultValue: 'Failed to join — please try again' }));
      setStatus('error');
    }
  }, [email, status, t, mode]);

  // button 模式下未展开：显示按钮
  if (mode === 'button' && !open) {
    return (
      <button
        onClick={() => { setOpen(true); setStatus('idle'); }}
        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-400 hover:to-orange-400 active:scale-[0.98] transition-all cursor-pointer select-none btn-shimmer"
      >
        {t('profile.premiumJoinWaitlist', { defaultValue: 'Join waitlist' })}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    );
  }

  // 成功状态
  if (status === 'success') {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4" />
        <p className="text-sm font-medium">
          {t('profile.waitlistSuccess', { defaultValue: "You're on the list — Symy will come find you when it's ready." })}
        </p>
      </div>
    );
  }

  // 表单状态（idle / submitting / error）
  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus('idle'); setErrorMsg(''); }}
          placeholder={t('profile.waitlistEmailPlaceholder', { defaultValue: 'your@email.com' })}
          autoFocus={mode === 'form'}
          disabled={status === 'submitting'}
          className="flex-1 px-3 py-2 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-xs placeholder:text-text-tertiary focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          aria-label={t('profile.premiumJoinWaitlist', { defaultValue: 'Join waitlist' })}
          className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-400 hover:to-orange-400 active:scale-[0.98] transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {errorMsg && (
        <p className="text-[10px] text-red-500">{errorMsg}</p>
      )}
    </form>
  );
}
