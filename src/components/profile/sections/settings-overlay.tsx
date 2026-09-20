'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { EmailConnection } from '@/lib/supabase';
import type { Locale } from '@/i18n/config';
// 🎚️ batch61-a: 守护风格向导 — 设置页内二级 overlay, 关闭后回到原位
import { GuardianStyleWizard } from './guardian-style-wizard';
// 🪶 batch95-a: 小白三问减法重设计 — overlay 只做编排, 默认区/高级折叠区各一小文件
import { SettingsBasicSection } from './settings-basic-section';
import { SettingsAdvancedSection } from './settings-advanced-section';
// 🛡️ batch95-a (99-d 定案): 强度双系统收敛 — 历史绿色偏好 firm/lockdown 一次性映射 strict
import { migrateLegacyGreenIntensity } from '@/hooks/use-guard-intensity';

interface SettingsOverlayProps {
  isDemo: boolean;
  hasCustomName: boolean;
  displayName: string;
  onClose: () => void;
  onOpenDisplayNameDialog: () => void;
  /** 🌱 绿色守护模式 — 荣誉开关 (默认开) */
  greenPrefEnabled: boolean;
  onToggleGreenPref: () => void;
  emailConnections: EmailConnection[];
  onDisconnectEmail: (connectionId: string) => Promise<void>;
  onNavigateMonitor?: () => void;
  isEmailMonitorEnabled: boolean;
  showComingSoonToast: () => void;
  darkMode: boolean;
  resolvedTheme: string | undefined;
  onToggleDarkMode: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  showPremiumToastMsg: (msg: string) => void;
  onOpenFaqDialog: () => void;
}

/**
 * 🔧 ARCH fix Round 78: Settings overlay — opened via top-right gear icon
 * (原为 profile-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {showSettingsOverlay && <SettingsOverlay .../>}
 * 🪶 batch95-a: 两层结构 — 默认只露小白核心行 (settings-basic-section),
 * 其余渐进披露收纳进「高级设置」折叠区 (settings-advanced-section), 不删功能。
 */
export function SettingsOverlay({ isDemo, hasCustomName, displayName, onClose, onOpenDisplayNameDialog, greenPrefEnabled, onToggleGreenPref, emailConnections, onDisconnectEmail, onNavigateMonitor, isEmailMonitorEnabled, showComingSoonToast, darkMode, resolvedTheme, onToggleDarkMode, locale, setLocale, showPremiumToastMsg, onOpenFaqDialog }: SettingsOverlayProps) {
  const { t } = useI18n();
  // 🎚️ batch61-a: 我的守护风格向导 — 设置页内二级 overlay, 关闭后回到原位
  const [showGuardianStyleWizard, setShowGuardianStyleWizard] = useState(false);

  // 🛡️ batch95-a: 一次性迁移老用户的绿色偏好强度选择 (firm/lockdown → strict),
  // 在强度 UI 收敛后防感知变弱; 幂等, 已有显式守护强度选择时不覆盖
  useEffect(() => {
    migrateLegacyGreenIntensity();
  }, []);

  return (
    <>
    <div className="fixed inset-0 z-[200] bg-surface-1 flex flex-col animate-tab-in max-w-md mx-auto">
      <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">{t('common.back', { defaultValue: '← Back' })}</span>
        </button>
        <h2 className="text-base font-bold text-text-primary ml-4">{t('profile.settings', { defaultValue: 'Settings' })}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
        <SettingsBasicSection
          isDemo={isDemo}
          hasCustomName={hasCustomName}
          displayName={displayName}
          onClose={onClose}
          onOpenDisplayNameDialog={onOpenDisplayNameDialog}
          greenPrefEnabled={greenPrefEnabled}
          onToggleGreenPref={onToggleGreenPref}
          darkMode={darkMode}
          resolvedTheme={resolvedTheme}
          onToggleDarkMode={onToggleDarkMode}
          onOpenFaqDialog={onOpenFaqDialog}
          t={t}
        />
        <SettingsAdvancedSection
          isDemo={isDemo}
          greenPrefEnabled={greenPrefEnabled}
          emailConnections={emailConnections}
          onNavigateMonitor={onNavigateMonitor}
          isEmailMonitorEnabled={isEmailMonitorEnabled}
          onDisconnectEmail={onDisconnectEmail}
          showComingSoonToast={showComingSoonToast}
          showPremiumToastMsg={showPremiumToastMsg}
          locale={locale}
          setLocale={setLocale}
          onOpenGuardianStyleWizard={() => setShowGuardianStyleWizard(true)}
          t={t}
        />
      </div>
    </div>
    {showGuardianStyleWizard && (
      <GuardianStyleWizard isDemo={isDemo} onClose={() => setShowGuardianStyleWizard(false)} />
    )}
    </>
  );
}
