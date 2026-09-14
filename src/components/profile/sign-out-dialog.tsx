'use client';

/**
 * SignOutConfirmDialog — Sign out confirmation dialog (P2-14 fix)
 *
 * Extracted from profile-tab.tsx to keep it under 800 lines.
 * Replaces the native confirm() with a styled, accessible dialog.
 */

import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Z_INDEX } from '@/lib/z-index';

interface SignOutConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SignOutConfirmDialog({ open, onConfirm, onCancel }: SignOutConfirmDialogProps) {
  const { t } = useI18n();

  if (!open) return null;

  return createPortal(
    <div
      // 🔧 PM-P1-2 fix (2026-07-17): 统一 z-index 层级
      //    旧代码: z-[10000] — 高于 DailyRitualOverlay (z-9999), 但破坏了层级规范
      //    新代码: z-[400] (MODAL_HIGH) — 高于标准模态框 (z-300), 低于仪式覆盖 (z-9999)
      //    原因: SignOut 是用户主动触发, 不会与 DailyRitualOverlay 同时出现
      //          (DailyRitualOverlay 全屏覆盖, 用户必须先关闭才能点击 SignOut)
      //          所以不需要盖过仪式覆盖, 只需盖过标准模态框即可
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ zIndex: Z_INDEX.MODAL_HIGH }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm bg-surface-2 border border-glass-border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-400 to-orange-500 rounded-t-2xl" />
        {/* Icon */}
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
            <LogOut className="w-6 h-6 text-red-400" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-text-primary text-center mb-2">
          {t('profile.signOut', { defaultValue: 'Sign Out' })}
        </h3>
        <p className="text-xs text-text-secondary text-center mb-5 leading-relaxed">
          {t('profile.signOutConfirmDesc', { defaultValue: "Sign out? Your streak and data are safe, but you'll need to sign back in to continue." })}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-glass-fill text-text-secondary text-sm font-medium hover:bg-glass-fill-strong transition-colors"
          >
            {t('profile.displayNameCancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-medium hover:from-red-400 hover:to-orange-400 transition-all"
          >
            {t('profile.signOut', { defaultValue: 'Sign Out' })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
