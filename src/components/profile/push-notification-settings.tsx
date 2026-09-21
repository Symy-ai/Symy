'use client';

/**
 * PushNotificationSettings — 推送通知设置 UI (偏好中心, batch60-b)
 *
 * 两层结构:
 * - 第一层: 总开关 (= 订阅/退订)。关闭后偏好区禁用但不丢失已存值 (locked 态)。
 * - 第二层: 偏好面板 (频率 + 类型开关)。已订阅时改动即 PATCH 并给"已更新"轻反馈;
 *   未订阅时是本地草稿, 订阅时与订阅一起写入 (服务端合并存量, 不被默认值覆盖)。
 *
 * 错误态诚实: 浏览器不支持 / 服务端表缺失 / 保存失败都走现有错误行, 不伪造开关成功。
 *
 * 使用:
 * <PushNotificationSettings t={t} />
 */

import { useState } from 'react';
import { usePushNotifications } from '@/lib/push/use-push-notifications';
import { usePushPreferences } from '@/lib/push/use-push-preferences';
import { DEFAULT_PUSH_PREFERENCES, type NormalizedPushPreferences } from '@/lib/push/preferences';
import { Bell } from 'lucide-react';
import { SettingToggle } from '@/components/profile-parts/setting-components';
import { PushPreferencesPanel } from './push-preferences-panel';
import type { useI18n } from '@/i18n/provider';

interface PushNotificationSettingsProps {
  t: ReturnType<typeof useI18n>['t'];
  isDemo?: boolean;
}

export function PushNotificationSettings({ t, isDemo }: PushNotificationSettingsProps) {
  const { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe } = usePushNotifications();
  const { preferences, load, save, isSaving, justSaved, saveError } = usePushPreferences();
  // 未订阅时的本地草稿 (订阅时一并写入); "已存值"是服务端回显, 草稿不覆盖它
  const [draft, setDraft] = useState<NormalizedPushPreferences>(DEFAULT_PUSH_PREFERENCES);
  // 总开关关掉后偏好区禁用 (值保留 — 展示最后已知的服务端偏好); 订阅成功后解锁
  const [lockedAfterOff, setLockedAfterOff] = useState(false);

  // Demo 模式不显示推送通知设置
  if (isDemo) return null;

  // 浏览器不支持推送通知 — 保留现有错误态, 不渲染偏好区 (不伪造可编辑)
  if (!isSupported) {
    return (
      <div className="px-4 py-2 rounded-xl bg-glass-fill border border-glass-border text-xs text-text-tertiary">
        {t('profile.pushNotSupported')}
      </div>
    );
  }

  // 已订阅 → 服务端权威值; 关闭后 → 保留最后已知值 (不丢已存值); 未订阅 → 本地草稿
  const activePreferences = isSubscribed || lockedAfterOff ? preferences : draft;

  const handleMasterToggle = async () => {
    if (isSubscribed) {
      const ok = await unsubscribe();
      setLockedAfterOff(ok);
    } else {
      const ok = await subscribe(activePreferences);
      if (ok) {
        setLockedAfterOff(false);
        await load(); // 服务端权威回显 (含服务端合并结果)
      }
    }
  };

  const handlePreferenceChange = (patch: Partial<NormalizedPushPreferences>) => {
    if (isSubscribed) {
      void save(patch);
    } else {
      setDraft({ ...draft, ...patch });
    }
  };

  return (
    <div className="space-y-2">
      <SettingToggle
        icon={<Bell className="w-4 h-4" />}
        label={t('profile.pushNotifications')}
        description={
          isSubscribed
            ? t('profile.pushSubscribed')
            : t('profile.pushNotSubscribed')
        }
        enabled={isSubscribed}
        onToggle={handleMasterToggle}
        disabled={isLoading || isSaving}
      />
      {error && (
        <p className="px-4 text-[10px] text-red-500">{error}</p>
      )}
      <PushPreferencesPanel
        t={t}
        preferences={activePreferences}
        onChange={handlePreferenceChange}
        disabled={lockedAfterOff && !isSubscribed}
        justSaved={isSubscribed && justSaved}
        isSaving={isSaving}
      />
      {saveError && (
        <p className="px-4 text-[10px] text-red-500" data-testid="push-prefs-save-error">{saveError}</p>
      )}
    </div>
  );
}
