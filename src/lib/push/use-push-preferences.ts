'use client';

/**
 * usePushPreferences — 推送偏好读写 (batch60-b)
 *
 * 职责单一: GET 回显 + PATCH 保存 (乐观更新, 失败回滚), 只碰偏好不碰订阅。
 * 订阅生命周期归 usePushNotifications; 两者在 PushNotificationSettings 组合。
 *
 * 轻反馈: justSaved 在一次成功保存后置真, 下一次改动时清掉 — 不用弹窗,
 * 不催促, 不定时器 (可测性优先)。
 */

import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  type NormalizedPushPreferences,
} from '@/lib/push/preferences';

export type PushPreferencesPatch = Partial<NormalizedPushPreferences>;

interface UsePushPreferencesReturn {
  preferences: NormalizedPushPreferences;
  isLoaded: boolean;
  isSaving: boolean;
  justSaved: boolean;
  saveError: string | null;
  load: () => Promise<void>;
  save: (patch: PushPreferencesPatch) => Promise<boolean>;
}

export function usePushPreferences(): UsePushPreferencesReturn {
  const [preferences, setPreferences] = useState<NormalizedPushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/push/preferences', { credentials: 'include' });
      if (!res.ok) {
        // 回显失败保留当前值 (默认或草稿), 不伪造已加载 — 面板仍可展示
        logger.warn('[usePushPreferences] Load failed:', res.status);
        return;
      }
      const body = await res.json();
      setPreferences(normalizePushPreferences(body?.preferences));
    } catch (err) {
      // safe to ignore: display stays on last known values; retry happens on next mount
      logger.warn('[usePushPreferences] Load exception:', err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // eslint-disable-next-line symy/no-async-callback-mutation -- save is a one-shot user action (toggle click); optimistic snapshot per call makes rapid re-invocation last-write-wins, matching the subscribe hook pattern
  const save = useCallback(async (patch: PushPreferencesPatch): Promise<boolean> => {
    setJustSaved(false);
    setSaveError(null);
    const previous = preferences;
    // 乐观更新 — 界面即刻响应, PATCH 失败回滚
    setPreferences({ ...previous, ...patch });
    setIsSaving(true);

    try {
      const res = await fetch('/api/push/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPreferences(previous);
        setSaveError(
          res.status === 401
            ? 'Please sign in to update push preferences.'
            : (body?.error as string | undefined) || 'Failed to save push preferences. Please try again.',
        );
        return false;
      }

      const body = await res.json();
      setPreferences(normalizePushPreferences(body?.preferences ?? { ...previous, ...patch }));
      setJustSaved(true);
    } catch (err) {
      // safe to ignore: state rolled back, error surfaced next to the panel
      setPreferences(previous);
      setSaveError(err instanceof Error ? err.message : 'Failed to save push preferences.');
      logger.warn('[usePushPreferences] Save exception:', err);
    } finally {
      setIsSaving(false);
    }
    return true;
  }, [preferences]);

  return { preferences, isLoaded, isSaving, justSaved, saveError, load, save };
}
