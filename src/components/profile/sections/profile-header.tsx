'use client';

import Image from 'next/image';
import { User, Crown, Camera, Loader2, Settings } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface ProfileHeaderProps {
  displayName: string;
  displayEmail: string;
  avatarInitial: string;
  plan: 'free' | 'premium';
  effectiveAvatarUrl: string | null;
  isUploadingAvatar: boolean;
  avatarError: string | null;
  /** 🔧 Bug 9 fix (Round 43): 只在 Profile tab 激活时渲染 file input, 防止泄漏到其他 tab */
  isActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditName: () => void;
  hasCustomName: boolean;
}

/**
 * Profile Header — 头像 (点击上传) + 名称/邮箱 + 编辑名 + plan 徽章
 * (原为 profile-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function ProfileHeader({ displayName, displayEmail, avatarInitial, plan, effectiveAvatarUrl, isUploadingAvatar, avatarError, isActive, fileInputRef, onAvatarUpload, onEditName, hasCustomName }: ProfileHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center pt-4">
      {/* 🔧 CL3 fix: 头像可点击上传 — 显示真实头像 (若有) 或字母首字母 */}
      <div className="relative w-20 h-20 mb-3 group/avatar cursor-pointer" onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}>
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400/20 to-purple-400/20 blur-md animate-pulse" />
        {effectiveAvatarUrl ? (
          <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/10">
            <Image src={effectiveAvatarUrl} alt={displayName} fill className="w-full h-full object-cover" style={{ objectPosition: 'top' }} unoptimized />
          </div>
        ) : (
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-3xl font-bold text-white ring-2 ring-white/10">
            {avatarInitial}
          </div>
        )}
        {/* 悬停遮罩 + 相机图标 */}
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
          {isUploadingAvatar ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
        {/* hidden file input — 🔧 Bug 9 fix (Round 43): 只在 Profile tab 激活时渲染,
            防止 hidden file input 泄漏到其他 tab 的 DOM 中。
            旧代码: file input 始终 mounted (所有 tab 同时渲染), 其他 tab DOM 中残留。
            修复: 加 isActive 条件, 只在 Profile tab 激活时渲染 file input。 */}
        {isActive && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarUpload}
            disabled={isUploadingAvatar}
            aria-hidden="true"
            tabIndex={-1}
          />
        )}
      </div>
      {/* 🔧 CL3 fix: 头像上传错误提示 */}
      {avatarError && (
        <p className="text-[11px] text-red-500 mb-1 -mt-2">{avatarError}</p>
      )}
      {/* 🔧 CL3 fix: 上传中提示 */}
      {isUploadingAvatar && (
        <p className="text-[11px] text-cyan-400 mb-1 -mt-2">{t('profile.avatarUploading', { defaultValue: 'Uploading...' })}</p>
      )}
      <h2 className="text-lg font-bold text-text-primary">{displayName}</h2>
      <p className="text-xs text-text-tertiary">{displayEmail}</p>
      {/* 🔧 P2-3 fix: Edit name button */}
      <button onClick={onEditName} className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-0.5 transition-colors inline-flex items-center gap-1">
        <Settings className="w-2.5 h-2.5" />
        {hasCustomName ? t('profile.editDisplayName') : t('profile.setDisplayNameBtn')}
      </button>
      <div className="flex items-center gap-1.5 mt-2">
        {plan === 'free' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
            <User className="w-3 h-3" />
            {t('profile.symyFree')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
            <Crown className="w-3 h-3" />
            {t('profile.symyPremium')}
          </span>
        )}
      </div>
    </div>
  );
}
