'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';

/**
 * 🔧 CL3 fix: 头像上传 (验证 → /api/user/avatar → 本地立即显示)
 * (原为 profile-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useAvatarUpload() {
  const { t } = useI18n();
  const { user } = useAuth();
  // 🔧 CL3 fix: 头像上传状态
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // R44-A-2: error toast timers tracked via ref + cleared on unmount (与 buddy-tab pulseTimerRefs 模式一致)
  const avatarErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // (原 cleanup effect 同时清 premiumToast timer; 拆分后两 hook 各自清理, 行为一致)
  useEffect(() => {
    return () => {
      if (avatarErrorTimerRef.current) clearTimeout(avatarErrorTimerRef.current);
    };
  }, []);

  const showAvatarError = useCallback((msg: string) => {
    setAvatarError(msg);
    if (avatarErrorTimerRef.current) clearTimeout(avatarErrorTimerRef.current);
    avatarErrorTimerRef.current = setTimeout(() => {
      setAvatarError(null);
      avatarErrorTimerRef.current = null;
    }, 4000);
  }, []);

  // 🔧 CL3 fix: 用户头像 URL — 优先 user_metadata.avatar_url (上传后立即生效),
  //   fallback 到 profile.avatar_url (DB), 都没有则 null (显示字母首字母)
  //   fallback 到 profile.avatar_url (DB), 都没有则 null (显示字母首字母)
  const userAvatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  // 上传后立即用本地 state 显示 (不等 onAuthStateChange 回流)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const effectiveAvatarUrl = localAvatarUrl || userAvatarUrl || null;

  // 🔧 CL3 fix: 头像上传 handler
  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 客户端验证 (与 API 一致)
    const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED_MIME.includes(file.type)) {
      showAvatarError(t('profile.avatarInvalidType', { defaultValue: 'Please select a PNG, JPEG, WebP, or GIF image' }));
      e.target.value = ''; // reset input
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showAvatarError(t('profile.avatarTooLarge', { defaultValue: 'Image must be under 5MB' }));
      e.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // 🔧 注意: 不能用 apiFetch (它强制 Content-Type: application/json), 用原生 fetch
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (${res.status})`);
      }
      const data = await res.json() as { success: boolean; avatarUrl: string };
      // 立即更新本地显示 (onAuthStateChange 也会回流, 但本地 state 更快)
      setLocalAvatarUrl(data.avatarUrl);
    } catch (err) {
      logger.error('[Profile] Avatar upload failed:', err);
      showAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = ''; // reset input 允许重复上传同一文件
    }
  }, [t, showAvatarError]);

  return { fileInputRef, isUploadingAvatar, avatarError, effectiveAvatarUrl, handleAvatarUpload };
}
