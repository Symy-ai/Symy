'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { Settings } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useTheme } from 'next-themes';
// 🌱 绿色守护开关 (荣誉开关): localStorage 零 DDL 持久化, 联动商品卡绿色徽章与 chat symy_green_pref
import { useGreenPref } from '@/hooks/use-green-pref';
import { AboutModal } from './profile/profile-parts';
// 🔧 P2-3/P2-14 fix: Extracted dialogs (keep profile-tab under 800 lines)
import { DisplayNameDialog, DisplayNamePrompt } from './profile/display-name-dialog';
import { SignOutConfirmDialog } from './profile/sign-out-dialog';
// 🔧 PM-#28 fix: FAQ dialog 替代死链 /#faq
import { FaqDialog } from './profile/faq-dialog';
import { DreamFundEmptyGuide } from './profile/dream-funds-empty-guide';
// 🔧 PM-P1-18 fix: 统一金额格式化
import { PremiumCard } from './profile/premium-card';
import { InviteCard } from './profile/invite-card';
import { GuardTotalsCard } from './profile-parts/guard-totals-card';
import { BlindSpotMap } from './profile/blind-spot-map';
// 🔧 新需求: Dream Funds 模块复制到 Me 页面 (独立组件, 修复拖拽 bug)
import { MeDreamFundsSection } from './profile/me-dream-funds-section';
import { MinimumPaymentTrapCard } from './buddy/minimum-payment-trap-card';
import type { ProfileTabProps } from './profile/profile-tab-props';
// ====== File Split Wave 1: 状态逻辑拆到 profile/hooks/*, JSX 区块拆到 profile/sections/* (纯搬运, 行为零变化) ======
import { usePremiumToast } from './profile/hooks/use-premium-toast';
// 💰 batch51-b: 时薪编辑态收进 TimeValueSetting 组件; profile-tab 只读共享时薪
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useAvatarUpload } from './profile/hooks/use-avatar-upload';
import { useProfileData } from './profile/hooks/use-profile-data';
import { useProfileStats } from './profile/hooks/use-profile-stats';
import { useProfileDialogs } from './profile/hooks/use-profile-dialogs';
import { DemoSignupPrompt } from './profile/sections/demo-signup-prompt';
import { ProfileHeader } from './profile/sections/profile-header';
import { ProfileFooter } from './profile/sections/profile-footer';
import { SettingsOverlay } from './profile/sections/settings-overlay';

/**
 * ProfileTab 编排壳 — 只负责 props 装配与 JSX 区块编排; 状态逻辑在 profile/hooks/*, 区块在 profile/sections/*。
 */
export function ProfileTab({ onNavigateMonitor, isDemo = false, onAuthPrompt: _onAuthPrompt, buddyStreak, buddyTotalSaved, buddyChallengesCompleted, buddyDreamFunds, isActive = true, onOpenInsights, onCreateDreamFund, onUpdateDreamFund, onDeleteDreamFund, onReorderDreamFunds, dreamFunds }: ProfileTabProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const darkMode = resolvedTheme !== 'light';
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { premiumToast, setPremiumToast, showPremiumToastMsg } = usePremiumToast();

  const onToggleDarkMode = () => {
    const newTheme = (resolvedTheme || 'dark') === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showPremiumToastMsg(newTheme === 'dark' ? t('profile.darkModeOn', { defaultValue: 'Dark mode on' }) : t('profile.lightModeOn', { defaultValue: 'Light mode on' }));
  };

  const { hourlyRate } = useHourlyRate(isDemo);
  const { fileInputRef, isUploadingAvatar, avatarError, effectiveAvatarUrl, handleAvatarUpload } = useAvatarUpload();
  const { profile, isEmailMonitorEnabled, emailConnections, uniqueReceipts, handleEmailDisconnect } = useProfileData({ showPremiumToastMsg });
  useProfileStats({ uniqueReceipts, buddyStreak, buddyTotalSaved, buddyChallengesCompleted, buddyDreamFunds });
  // 🌱 绿色守护模式 (荣誉开关): 默认开; 关闭时小象少管、守护勋章停发 (见 offNote 文案)
  const { greenPrefEnabled, setGreenPrefEnabled } = useGreenPref();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('profile.user');
  const displayEmail = user?.email || t('profile.notSignedIn');
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // 🔧 P2-3 fix: Detect if user has a custom display name (not email prefix)
  const emailPrefix = user?.email?.split('@')[0] || '';
  const hasCustomName = !!(user?.user_metadata?.full_name && user.user_metadata.full_name !== emailPrefix);
  const needsNamePrompt = !isDemo && !hasCustomName && !!emailPrefix;

  const {
    showAboutModal, setShowAboutModal,
    showSettingsOverlay, setShowSettingsOverlay,
    showDisplayNameDialog, setShowDisplayNameDialog,
    displayNameInitial,
    showSignOutConfirm, setShowSignOutConfirm,
    showFaqDialog, setShowFaqDialog,
    openDisplayNameDialog,
    handleDisplayNameSaved,
    handleDisplayNameError,
    handleSignOutClick,
    handleSignOutConfirm,
  } = useProfileDialogs({ hasCustomName, userFullName: user?.user_metadata?.full_name, signOut, setPremiumToast, showPremiumToastMsg });

  // N61 fix: Coming Soon 行点击反馈 toast
  const showComingSoonToast = useCallback(() => {
    showPremiumToastMsg(t('profile.comingSoonToast', { defaultValue: 'Coming soon — stay tuned! 🚀' }));
  }, [t, showPremiumToastMsg]);

  // ====== Demo 模式：注册引导 CTA ======
  // 🔧 U-1 fix: 加 !user guard，防止已登录用户因 isDemo 竞态看到注册引导
  if (isDemo && !user) {
    return <DemoSignupPrompt />;
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 space-y-6 relative custom-scrollbar">
      {/* 🔧 ARCH fix Round 78: Settings button (top-right) — opens settings overlay */}
      <button
        onClick={() => setShowSettingsOverlay(true)}
        className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-glass-fill hover:bg-glass-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors z-10"
        aria-label={t('profile.settingsAriaLabel', { defaultValue: 'Settings' })}
      >
        <Settings className="w-5 h-5" />
      </button>
      {/* Profile Header */}
      <ProfileHeader
        displayName={displayName}
        displayEmail={displayEmail}
        avatarInitial={avatarInitial}
        plan={profile.plan}
        effectiveAvatarUrl={effectiveAvatarUrl}
        isUploadingAvatar={isUploadingAvatar}
        avatarError={avatarError}
        isActive={isActive}
        fileInputRef={fileInputRef}
        onAvatarUpload={handleAvatarUpload}
        onEditName={openDisplayNameDialog}
        hasCustomName={hasCustomName}
      />

      {/* 🔧 P2-3 fix: Display name prompt for existing users (extracted component) */}
      {needsNamePrompt && <DisplayNamePrompt onSet={openDisplayNameDialog} />}
      {/* owner 09-06: 总览 + 本周守护 + 守护战绩 三合一为 守护战绩 (GuardTotalsCard), 点击打开原总览详情页 */}
            {!isDemo && <GuardTotalsCard isActive={isActive} onOpenInsights={onOpenInsights} />}

      {/* 🔧 新需求: Dream Funds 复制到 Me 页面 (This week's seeing 下方), 独立组件修复拖拽 */}
      {!isDemo && dreamFunds && dreamFunds.length > 0 && (
        <MeDreamFundsSection
          dreamFunds={dreamFunds}
          isDemo={isDemo}
          onCreateDreamFund={onCreateDreamFund}
          onUpdateDreamFund={onUpdateDreamFund}
          onDeleteDreamFund={onDeleteDreamFund}
          onReorderDreamFunds={onReorderDreamFunds}
          onToast={(msg) => showPremiumToastMsg(msg)}
        />
      )}
      {/* 🔧 U-5 fix / T-2: Dream Funds 空状态引导 */}
      <DreamFundEmptyGuide
        isDemo={isDemo}
        dreamFunds={dreamFunds}
        onCreateDreamFund={onCreateDreamFund}
        onToast={(msg) => showPremiumToastMsg(msg)}
      />
      {/* 🔧 Bug fix: 最低还款陷阱跟随 Dream Funds 迁移到 Me 页面 */}
      {!isDemo && dreamFunds && dreamFunds.length > 0 && (
        <MinimumPaymentTrapCard dreamFunds={dreamFunds} hourlyRate={hourlyRate} isDemo={isDemo} />
      )}

      {/* 🔧 ARCH fix Round 78: Blind Spot Map — between Weekly Review and Premium */}
      {!isDemo && <BlindSpotMap isActive={isActive} />}

      {/* 🔧 需求六: Premium 价值矩阵卡片 (替换旧的单行 Premium 按钮) */}
      {profile.plan === 'free' && (
        <PremiumCard locale={locale} />
      )}

      {/* 🔧 需求七: 邀请好友卡片 */}
      {!isDemo && <InviteCard />}

      {/* 🔧 ARCH fix Round 78: Settings section moved to overlay (opened via top-right gear icon).
          Member Since + About footer stay on main profile page. */}
      <ProfileFooter createdAt={user?.created_at} locale={locale} onOpenAbout={() => setShowAboutModal(true)} />

      {/* 🔧 BUG-2 fix: PushNotificationSettings 已移到设置 overlay 内 */}

      {/* 🔧 ARCH fix Round 78 P2-10: Sign Out button on main profile page (not only in settings) */}
      {/* 🔧 P2-14 fix: Opens styled confirmation dialog instead of native confirm() */}
      {!isDemo && (
        <button
          onClick={handleSignOutClick}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          {t('profile.signOut', { defaultValue: 'Sign Out' })}
        </button>
      )}

      {/* 🔧 BUG-2 fix: DeleteAccountButton 已移到设置 overlay 内 */}

      {/* 🔧 Bug 3 fix: 关于我们对话框 */}
      {showAboutModal && (
        <AboutModal onClose={() => setShowAboutModal(false)} />
      )}

      {/* 🔧 P2-3 fix: Display name dialog (extracted component) */}
      <DisplayNameDialog
        open={showDisplayNameDialog}
        initialName={displayNameInitial}
        onClose={() => setShowDisplayNameDialog(false)}
        onSaved={handleDisplayNameSaved}
        onError={handleDisplayNameError}
      />

      {/* 🔧 P2-14 fix: Sign out confirmation dialog (extracted component) */}
      <SignOutConfirmDialog
        open={showSignOutConfirm}
        onConfirm={handleSignOutConfirm}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {/* 🔧 PM-#28 fix: FAQ dialog (替代死链 /#faq) */}
      <FaqDialog
        open={showFaqDialog}
        onClose={() => setShowFaqDialog(false)}
      />

      {/* 🔧 N40 fix: Premium toast — Round 115: z-[300] above settings overlay (z-[200]) */}
      {premiumToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg backdrop-blur-sm animate-in slide-in-from-top fade-in duration-300 bg-amber-500/90 text-white">
          {premiumToast}
        </div>
      )}

      {/* 🔧 ARCH fix Round 78: Settings overlay — opened via top-right gear icon */}
      {showSettingsOverlay && (
        <SettingsOverlay
          isDemo={isDemo}
          hasCustomName={hasCustomName}
          displayName={displayName}
          onClose={() => setShowSettingsOverlay(false)}
          onOpenDisplayNameDialog={openDisplayNameDialog}
          greenPrefEnabled={greenPrefEnabled}
          onToggleGreenPref={() => setGreenPrefEnabled(!greenPrefEnabled)}
          emailConnections={emailConnections}
          onDisconnectEmail={handleEmailDisconnect}
          onNavigateMonitor={onNavigateMonitor}
          isEmailMonitorEnabled={isEmailMonitorEnabled}
          showComingSoonToast={showComingSoonToast}
          darkMode={darkMode}
          resolvedTheme={resolvedTheme}
          onToggleDarkMode={onToggleDarkMode}
          locale={locale}
          setLocale={setLocale}
          showPremiumToastMsg={showPremiumToastMsg}
          onOpenFaqDialog={() => setShowFaqDialog(true)}
        />
      )}
    </div>
  );
}
