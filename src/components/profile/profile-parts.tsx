/**
 * Profile Tab Parts — 从 profile-tab.tsx 提取的子组件
 *
 * 🔧 架构优化 Round 3: profile-tab.tsx 901→<800 行
 *    提取: EmailConnectionSetting (~85 行) + FeaturePreviewCard (~25 行) + AboutModal (~65 行)
 */

'use client';

import { createPortal } from 'react-dom';
import { Mail, MailCheck, MailX, ChevronRight, X, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { EmailConnection } from '@/lib/supabase';
import { WaitlistForm } from './waitlist-form';

// ============================================================
// EmailConnectionSetting — 邮箱连接状态显示
// 🔧 VIP 内测: 邮箱接入仅对 premium 用户开放, 普通用户看到"加入候补名单"
// ============================================================

export function EmailConnectionSetting({
  connections,
  onDisconnect,
  onNavigateMonitor,
  isVIPEnabled = false,
}: {
  connections: EmailConnection[];
  onDisconnect: (id: string) => void;
  onNavigateMonitor?: () => void;
  /** 🔧 VIP 内测: 只有 premium 用户才能直接连接邮箱 */
  isVIPEnabled?: boolean;
}) {
  const { t } = useI18n();
  const activeConnection = connections.find((c) => c.status === 'active');
  const expiredConnection = connections.find((c) => c.status === 'expired');

  // 🔧 VIP 内测: 已有活跃连接的用户仍可访问 (向后兼容)
  if (activeConnection) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onNavigateMonitor}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateMonitor?.(); }}
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors cursor-pointer text-left"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center text-green-400">
          <MailCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.emailConnected')}</p>
          <p className="text-xs text-text-tertiary truncate">{activeConnection.email_address}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDisconnect(activeConnection.id); }}
          className="p-2 rounded-lg hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors cursor-pointer select-none active:scale-90"
          title={t('common.disconnect')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronRight className="w-4 h-4 text-icon-muted" />
      </div>
    );
  }

  if (expiredConnection) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onNavigateMonitor}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateMonitor?.(); }}
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors cursor-pointer text-left"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-yellow-500/15 flex items-center justify-center text-yellow-400">
          <MailX className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-400">{t('profile.emailExpired')}</p>
          <p className="text-xs text-text-tertiary truncate">{expiredConnection.email_address}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-icon-muted" />
      </div>
    );
  }

  // 🔧 VIP 内测: 普通用户看到"VIP 内测"入口, 点击加入候补名单
  //   只有 isVIPEnabled=true (plan='premium') 的用户才能直接进入 Live Monitor
  // 🔧 BUG-2 fix: VIP 区域下方直接渲染候补名单表单 (与 PremiumCard 复用同一组件)
  if (!isVIPEnabled) {
    return (
      <div className="space-y-2">
        <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
            <Mail className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.emailMonitorVIP')}
            </p>
            <p className="text-xs text-amber-500/80">
              {t('profile.emailMonitorVIPDesc')}
            </p>
          </div>
          <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
            VIP
          </span>
        </div>
        <WaitlistForm mode="form" />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigateMonitor}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateMonitor?.(); }}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors cursor-pointer text-left"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Mail className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.emailMonitor')}</p>
        <p className="text-xs text-text-tertiary">{t('profile.tapToConnectEmail')}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-icon-muted" />
    </div>
  );
}

// ============================================================
// FeaturePreviewCard — Demo 模式功能预览卡
// ============================================================

export function FeaturePreviewCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card rounded-xl p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-glass-fill flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AboutModal — 关于我们对话框
// ============================================================

export function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[calc(100%-2rem)] max-w-sm max-h-[80vh] overflow-y-auto rounded-2xl p-6 space-y-4 bg-surface-2 border border-glass-border shadow-2xl custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-glass-fill text-text-secondary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center pt-2">
          <div className="text-3xl mb-2">🐘</div>
          <h2 className="text-lg font-bold gradient-text">
            {t('about.title', { defaultValue: 'Symy AI' })}
          </h2>
          <p className="text-xs text-text-tertiary mt-1">
            {t('about.tagline', { defaultValue: 'You already know.' })}
          </p>
        </div>

        <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
          <p>
            {t('about.p1', { defaultValue: 'Symy AI is a green-consumption AI companion built by the Symy team — at the moment of decision, Symy the little elephant holds the green gate for you and the planet.' })}
          </p>
          <p>
            {t('about.p2', { defaultValue: 'In 2026, big tech AI has become a tool for exploiting consumers — TikTok Shop predicts what you want to buy, TEMU dynamically prices to extract every cent, Instagram uses AI to keep you scrolling endlessly.' })}
          </p>
          <p>
            {t('about.p3', { defaultValue: 'Symy AI is the opposite: AI works for people, not capital — holding the green gate at the moment of purchase. Less bought, less made.' })}
          </p>
          <p className="font-medium text-text-primary">
            {t('about.mission', { defaultValue: 'Buy less, live more — spend less on what you don\'t need, save more for what truly matters.' })}
          </p>
        </div>

        {/* 🔧 PM decision 3: Why Symy? section — 列出具体用户利益 */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-sm font-bold text-text-primary">
            {t('about.whySymyTitle', { defaultValue: 'Why Symy?' })}
          </h3>
          <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">🪞</span>
              <span>{t('about.why1', { defaultValue: 'See the real cost — every purchase in hours of your life, not just dollars.' })}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">🛡️</span>
              <span>{t('about.why2', { defaultValue: 'See the real cost — TikTok, Instagram, Amazon spending traps named and defused.' })}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">🐘</span>
              <span>{t('about.why3', { defaultValue: 'A companion that grows with you — not another app that judges you.' })}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">💰</span>
              <span>{t('about.why4', { defaultValue: 'Reclaim what you didn\'t spend — turn "I didn\'t buy" into real progress toward your dreams.' })}</span>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-glass-border text-center">
          <p className="text-[10px] text-text-tertiary">
            {t('about.copyright', { defaultValue: '© 2026 Symy. All rights reserved.' })}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            {t('about.footer', { defaultValue: 'symy.ai · You already know.' })}
          </p>
          {/* 🔧 PM3-P2-3 fix: 添加"访问网站"按钮, 点击打开 window.location.origin (当前环境) */}
          {/*   需求: 按钮文案保留 "symy.ai · You already know." (品牌名), 但点击行为改为打开 window.location.origin */}
          {/*   旧代码: 无此按钮, 用户无法访问当前环境首页 */}
          {/*   新代码: 添加按钮, 点击打开 window.location.origin */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.open(window.location.origin, '_blank', 'noopener,noreferrer');
              }
            }}
            className="mt-2 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer underline"
          >
            {t('about.visitSite', { defaultValue: 'Visit symy.ai →' })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
