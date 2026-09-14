'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';

interface UseProfileDialogsArgs {
  hasCustomName: boolean;
  /** user?.user_metadata?.full_name (openDisplayNameDialog 的初始值来源) */
  userFullName?: string;
  signOut: () => Promise<void>;
  setPremiumToast: (msg: string | null) => void;
  showPremiumToastMsg: (msg: string) => void;
}

/**
 * Me 页全部弹层的开关状态 + display name / sign out 处理器
 * (原为 profile-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useProfileDialogs({ hasCustomName, userFullName, signOut, setPremiumToast, showPremiumToastMsg }: UseProfileDialogsArgs) {
  const { t } = useI18n();
  // 🔧 Bug 3 fix: 关于我们对话框状态
  const [showAboutModal, setShowAboutModal] = useState(false);
  // 🔧 ARCH fix Round 78: Settings overlay — bottom section moved into overlay
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  // 🔧 P2-3 fix: Display name dialog state (extracted to DisplayNameDialog component)
  const [showDisplayNameDialog, setShowDisplayNameDialog] = useState(false);
  const [displayNameInitial, setDisplayNameInitial] = useState('');
  // 🔧 P2-14 fix: Sign out confirmation dialog state (extracted to SignOutConfirmDialog component)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // 🔧 PM-#28 fix: FAQ dialog state (替代死链 /#faq)
  const [showFaqDialog, setShowFaqDialog] = useState(false);

  // 🔧 P2-3 fix: Display name dialog handlers
  const openDisplayNameDialog = useCallback(() => {
    setDisplayNameInitial(hasCustomName ? (userFullName as string) : '');
    setShowDisplayNameDialog(true);
  }, [hasCustomName, userFullName]);
  // 🔧 2026-07-15 P1-4 fix: name 保存后显示 toast + 延迟 reload 让 toast 先显示
  //   旧代码: 直接 window.location.reload() → 用户看不到任何反馈, 页面突然刷新
  //   修复: 关闭 dialog + 显示 toast "Name updated" + 1.5s 后 reload
  const handleDisplayNameSaved = useCallback(() => {
    setShowDisplayNameDialog(false);
    showPremiumToastMsg(t('profile.nameSaved', { defaultValue: 'Name updated' }));
    setTimeout(() => window.location.reload(), 1500);
  }, [showPremiumToastMsg, t]);
  const handleDisplayNameError = useCallback((msg: string) => setPremiumToast(msg), [setPremiumToast]);

  // 🔧 P2-14 fix: Sign out — opens styled dialog instead of native confirm
  const handleSignOutClick = useCallback(() => setShowSignOutConfirm(true), []);
  const handleSignOutConfirm = useCallback(async () => { setShowSignOutConfirm(false); await signOut(); }, [signOut]);

  return {
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
  };
}
