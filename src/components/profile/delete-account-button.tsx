'use client';

/**
 * DeleteAccountButton — GDPR Article 17: Right to Erasure
 *
 * 🔧 2026-07-20 (P0 fix): 从 profile-tab.tsx 提取, 减少 profile-tab 行数 (811 → ~790)
 *    旧代码: 内联 async onClick + useCallback handler, 占 ~30 行
 *    修复: 独立组件, profile-tab 只需 1 行 <DeleteAccountButton isDemo={isDemo} t={t} />
 *
 * 🔧 ARCH fix (2026-07-21): Use apiFetchVoid instead of raw fetch
 *    Old: const response = await fetch('/api/user/delete-account', { method: 'POST' });
 *    New: await apiFetchVoid('/api/user/delete-account', { method: 'POST' });
 *    Benefits: automatic error handling, timeout, cookie credentials
 */

import { useCallback } from 'react';
import type { useI18n } from '@/i18n/provider';
import { apiFetchVoid, ApiError } from '@/lib/api-client';
import { showToast } from '@/lib/toast';

interface DeleteAccountButtonProps {
  isDemo: boolean;
  t: ReturnType<typeof useI18n>['t'];
}

export function DeleteAccountButton({ isDemo, t }: DeleteAccountButtonProps) {
  // eslint-disable-next-line symy/no-async-callback-mutation -- delete-account is a one-shot destructive action, rapid re-invocation is harmless (second call will 404 after first succeeds)
  const handleDeleteAccount = useCallback(async () => {
    if (!confirm(t('profile.deleteAccountConfirm', { defaultValue: 'Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently removed.' }))) return;
    try {
      await apiFetchVoid('/api/user/delete-account', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      // safe to ignore: shows alert to user; error is logged by apiFetchVoid
      if (err instanceof ApiError && err.status === 401) {
        showToast(t('profile.deleteAccountFailed', { defaultValue: 'Failed to delete account. Please try again or contact support.' }), 'error');
      } else {
        showToast(t('profile.deleteAccountFailed', { defaultValue: 'Failed to delete account. Please try again or contact support.' }), 'error');
      }
    }
  }, [t]);

  if (isDemo) return null;

  return (
    <button
      onClick={handleDeleteAccount}
      className="w-full py-2 rounded-xl text-xs font-medium text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
    >
      {t('profile.deleteAccount', { defaultValue: 'Delete Account' })}
    </button>
  );
}
