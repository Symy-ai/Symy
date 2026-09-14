'use client';

/**
 * AuthPromptModal — 注册拦截弹窗
 *
 * 当未登录用户点击需要登录的功能按钮时弹出。
 * 展示功能价值 + 注册/登录引导。
 */

import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, ArrowRight, LogIn, UserPlus, Shield, Zap, Heart } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface AuthPromptModalProps {
  visible: boolean;
  /** 哪个功能触发了弹窗，用于个性化提示文案 */
  feature?: 'chat' | 'challenge' | 'healing' | 'connect_email' | 'refund' | 'insights' | 'profile' | 'general' | string;
  onClose: () => void;
}

const FEATURE_CONTEXT: Record<string, {
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  benefitKeys: string[];
}> = {
  chat: {
    titleKey: 'authPrompt.features.chat.title',
    descKey: 'authPrompt.features.chat.description',
    icon: <Zap className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.chat.benefit0', 'authPrompt.features.chat.benefit1', 'authPrompt.features.chat.benefit2'],
  },
  challenge: {
    titleKey: 'authPrompt.features.challenge.title',
    descKey: 'authPrompt.features.challenge.description',
    icon: <Shield className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.challenge.benefit0', 'authPrompt.features.challenge.benefit1', 'authPrompt.features.challenge.benefit2'],
  },
  healing: {
    titleKey: 'authPrompt.features.healing.title',
    descKey: 'authPrompt.features.healing.description',
    icon: <Heart className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.healing.benefit0', 'authPrompt.features.healing.benefit1', 'authPrompt.features.healing.benefit2'],
  },
  connect_email: {
    titleKey: 'authPrompt.features.connect_email.title',
    descKey: 'authPrompt.features.connect_email.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.connect_email.benefit0', 'authPrompt.features.connect_email.benefit1', 'authPrompt.features.connect_email.benefit2'],
  },
  refund: {
    titleKey: 'authPrompt.features.refund.title',
    descKey: 'authPrompt.features.refund.description',
    icon: <Shield className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.refund.benefit0', 'authPrompt.features.refund.benefit1', 'authPrompt.features.refund.benefit2'],
  },
  insights: {
    titleKey: 'authPrompt.features.insights.title',
    descKey: 'authPrompt.features.insights.description',
    icon: <Zap className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.insights.benefit0', 'authPrompt.features.insights.benefit1', 'authPrompt.features.insights.benefit2'],
  },
  profile: {
    titleKey: 'authPrompt.features.profile.title',
    descKey: 'authPrompt.features.profile.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.profile.benefit0', 'authPrompt.features.profile.benefit1', 'authPrompt.features.profile.benefit2'],
  },
  general: {
    titleKey: 'authPrompt.features.general.title',
    descKey: 'authPrompt.features.general.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.general.benefit0', 'authPrompt.features.general.benefit1', 'authPrompt.features.general.benefit2'],
  },
  butterfly: {
    titleKey: 'authPrompt.features.butterfly.title',
    descKey: 'authPrompt.features.butterfly.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.butterfly.benefit0', 'authPrompt.features.butterfly.benefit1', 'authPrompt.features.butterfly.benefit2'],
  },
  // 🔧 PM3-P1-3 fix: aha_moment feature context (See it 提交时弹)
  aha_moment: {
    titleKey: 'authPrompt.features.aha_moment.title',
    descKey: 'authPrompt.features.aha_moment.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.aha_moment.benefit0', 'authPrompt.features.aha_moment.benefit1', 'authPrompt.features.aha_moment.benefit2'],
  },
  // 🔧 PM3-P1-3 fix: gacha feature context (Gacha 用完后弹)
  gacha: {
    titleKey: 'authPrompt.features.gacha.title',
    descKey: 'authPrompt.features.gacha.description',
    icon: <Sparkles className="w-5 h-5" />,
    benefitKeys: ['authPrompt.features.gacha.benefit0', 'authPrompt.features.gacha.benefit1', 'authPrompt.features.gacha.benefit2'],
  },
};

export function AuthPromptModal({ visible, feature = 'general', onClose }: AuthPromptModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const { t } = useI18n();
  const context = FEATURE_CONTEXT[feature] || FEATURE_CONTEXT.general;
  // BUG-149 fix: 追踪 close timer 以便卸载时清理
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔧 BUG-42 fix: 当 visible 变为 true 时重置 isClosing 状态
  // 🔧 FIX-React19: effect 内 setState 是 "prop 变化 → 重置内部 state" 的合理模式
  // (替代方案 key={visible} 强制 remount 会丢失其他内部 state, 不适用)
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prop → state 重置模式
      setIsClosing(false);
    }
    // BUG-149 fix: 组件卸载时清理 close timer
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [visible]);

  // 🔧 P3-6 fix: Escape 键关闭弹窗 (a11y 标准) — 用 onClose prop (稳定引用, 不依赖 handleClose)
  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [visible, onClose]);

  if (!visible) return null;

  const handleClose = () => {
    setIsClosing(true);
    // BUG-149 fix: 追踪 timer ref
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-[150] flex items-center justify-center transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-[90%] max-w-[380px] glass-card-strong rounded-2xl p-6 transition-all duration-200 ${
          isClosing ? 'scale-95 translate-y-4' : 'scale-100 translate-y-0'
        }`}
      >
        {/* Top neon accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 to-green-500 rounded-t-2xl" />

        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-glass-fill hover:bg-glass-fill-strong flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-green-600/20 flex items-center justify-center text-emerald-400 relative">
            {context.icon}
            <div className="absolute inset-0 rounded-full border border-emerald-400/20 animate-pulse-ring" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-text-primary text-center mb-2">
          {t(context.titleKey)}
        </h3>

        {/* Description */}
        <p className="text-sm text-text-secondary text-center mb-4 leading-relaxed">
          {t(context.descKey)}
        </p>

        {/* Benefits */}
        <div className="space-y-2 mb-5">
          {context.benefitKeys.map((key, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-glass-fill">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="text-xs text-text-secondary">{t(key)}</span>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={() => {
              window.location.href = '/auth/signup';
            }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:from-emerald-400 hover:to-green-500 transition-all active:scale-95 btn-shimmer shadow-lg shadow-emerald-500/20"
          >
            <UserPlus className="w-4 h-4" />
            {t('authPrompt.createFreeAccount')}
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              window.location.href = '/auth/login';
            }}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-secondary text-sm font-medium hover:bg-glass-fill-strong hover:text-text-primary transition-all active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            {t('authPrompt.alreadyHaveAccount')}
          </button>
        </div>

        {/* Subtle note */}
        <p className="text-[10px] text-text-tertiary text-center mt-4">
          {t('authPrompt.disclaimer')}
        </p>
      </div>
    </div>
  );
}
