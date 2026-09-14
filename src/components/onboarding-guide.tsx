'use client';

/**
 * OnboardingGuide — New user onboarding overlay component
 *
 * Uses spotlight mask + floating tooltip cards to guide users through the system.
 * Step flow (green guardian narrative — batch3-a):
 *   0. Welcome (centered card + elephant avatar) — 你即将成为绿色守护者
 *   1. Buddy tab + highlight — 小象绿色守护伙伴 (拦截冲动消费, 省真钱)
 *   2. Buddy tab "See it" button + highlight — 陪你多想一下 + 绿色替代
 *   3. Profile tab + highlight — 省下的钱流进梦想基金
 *   4. Complete (centered card) — 绿色守护者称号 + 真实 starter 挑战首护仪式
 *
 * "Skip Guide" → calls API to set onboarding_completed=true → never shows again
 * "Don't show this again" (last step) → same as Skip → never shows again
 * Completing all steps → does NOT record to DB → shows again on next login (for testing)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PawPrint, User, Sparkles, ArrowRight, SkipForward, X, BellOff, Shield, Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetchVoid, apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { FirstGateList } from '@/components/onboarding/first-gate-list';

// ====== 步骤定义 ======
interface OnboardingStep {
  id: string;
  targetSelector: string;       // CSS selector for the target element
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  switchToTab?: string;         // 如果需要切换 tab
  spotlightPadding?: number;    // 高亮区域额外 padding
  tooltipPosition?: 'top' | 'bottom' | 'center'; // 提示卡片位置
}

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    targetSelector: '',
    titleKey: 'onboarding.steps.welcome.title',
    descKey: 'onboarding.steps.welcome.description',
    icon: <Sparkles className="w-8 h-8" />,
    tooltipPosition: 'center',
  },
  {
    // 🔧 PM-P2-5 fix (2026-07-17): 更新为 3-tab 架构 — Buddy tab 是核心入口
    //   旧代码: 引导 chat tab (Magic Mirror 入口) — 但 chat tab 已合并到 Buddy
    //   新代码: 引导 Buddy tab — 伴侣 + Magic Mirror + Gacha 入口
    id: 'buddy',
    targetSelector: '[data-onboarding="tab-buddy"]',
    titleKey: 'onboarding.steps.buddy.title',
    descKey: 'onboarding.steps.buddy.description',
    icon: <PawPrint className="w-6 h-6" />,
    switchToTab: 'buddy',
    tooltipPosition: 'top',
  },
  {
    id: 'seeIt',
    targetSelector: '[data-onboarding="see-it-button"]',
    titleKey: 'onboarding.steps.seeIt.title',
    descKey: 'onboarding.steps.seeIt.description',
    icon: <Shield className="w-6 h-6" />,
    tooltipPosition: 'top',
  },
  {
    id: 'dreamFunds',
    targetSelector: '[data-onboarding="tab-profile"]',
    titleKey: 'onboarding.steps.dreamFunds.title',
    descKey: 'onboarding.steps.dreamFunds.description',
    icon: <Sprout className="w-6 h-6" />,
    switchToTab: 'profile',
    tooltipPosition: 'top',
  },
  {
    id: 'complete',
    targetSelector: '',
    titleKey: 'onboarding.steps.complete.title',
    descKey: 'onboarding.steps.complete.description',
    icon: <Sparkles className="w-8 h-8" />,
    tooltipPosition: 'center',
  },
];

// ====== Props ======
interface OnboardingGuideProps {
  onComplete: () => void;
  onSwitchTab: (tab: string) => void;
  onSkip?: () => void;  // 外部跳过回调（用于 Demo 模式记录 localStorage）
  visible: boolean;
  isDemo?: boolean;  // 🔧 BUG-57 fix: Demo 模式下跳过 API 调用
}

export function OnboardingGuide({ onComplete, onSwitchTab, onSkip, visible, isDemo = false }: OnboardingGuideProps) {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  // 🔧 FIX-React19: isAnimating 直接派生自 visible (之前是 useState + useEffect 同步, 触发 Compiler 警告)
  // 现在: 派生值, 不需要 setState
  const isAnimating = visible;
  // tooltipVisible 仍需 state (用于"切步骤时重启动画"的命令式控制)
  const [tooltipVisible, setTooltipVisible] = useState(visible);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // 🔧 ARCH fix (Round 24 M6 — onboarding retry setTimeout 未在 unmount 时清理):
  //    旧代码 handleNext/handleSkip 失败后设 2s 重试 timer, 但不保存 ref, unmount 后仍触发。
  //    根因修复: 用 ref 跟踪 retry timer, unmount 时 clearTimeout。
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const step = STEPS[currentStep];
  const isCenterStep = step.tooltipPosition === 'center';
  const isWelcomeStep = step.id === 'welcome';
  const isDisplayNameStep = step.id === 'displayName';
  const isCompleteStep = step.id === 'complete';
  const totalSteps = STEPS.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  // 🔧 P2-3 fix: Display name input state
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // ====== 更新高亮区域位置 ======
  const updateSpotlight = useCallback(() => {
    if (!step.targetSelector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setSpotlightRect(el.getBoundingClientRect());
    } else {
      setSpotlightRect(null);
    }
  }, [step.targetSelector]);

  // 步骤变化时更新 spotlight
  useEffect(() => {
    if (!visible) return;

    // 🔧 ARCH fix (Round 19 BUG-R19D-L4 — tooltipVisible 不响应 visible false→true 变化):
    //    旧代码 useState(visible) 只用初始 visible 值。visible 从 false 变 true 时
    //    tooltipVisible 仍是 false, 前 400ms + 2 rAF 期间 tooltip opacity-0。
    //    根因修复: visible 变 true 时立即同步 tooltipVisible=true (除非后续 effect 会重启动画)。
    // 🔧 ARCH fix (Round 68): eslint-disable for react-hooks/set-state-in-effect
    //    (this is a legitimate "prop → state sync" pattern, not cascading render)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop→state sync (visible→tooltipVisible)
    setTooltipVisible(true);

    // 如果需要切换 tab，先切换
    if (step.switchToTab) {
      onSwitchTab(step.switchToTab);
    }

    // 等待 tab 切换后 DOM 更新再获取位置
    let raf1 = 0;
    let raf2 = 0;
    const timer = setTimeout(() => {
      updateSpotlight();
      // 先隐藏再显示，触发动画
      setTooltipVisible(false);
      // 🔧 ARCH fix (Round 12 M15): 跟踪 rAF handles, cleanup 时 cancel
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setTooltipVisible(true);
        });
      });
    }, 400); // 等待 tab 切换动画完成

    return () => {
      clearTimeout(timer);
      // 🔧 Round 12 M15: cancel rAF 防止卸载后 setState
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [currentStep, visible, step.switchToTab, onSwitchTab, updateSpotlight]);

  // 窗口 resize 时更新位置
  useEffect(() => {
    if (!visible) return;
    const handleResize = () => updateSpotlight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [visible, updateSpotlight]);

  // 🔧 FIX-React19: 移除 "visible 变化 → setState 同步" 的 effect
  // 之前: useEffect 内 setIsAnimating/setTooltipVisible (React 19 Compiler 警告)
  // 现在: isAnimating 直接派生自 visible; tooltipVisible 用 useState(visible) 初始化
  // 当 visible 变 false 时, 组件 return null 不渲染, tooltipVisible 状态保留无所谓
  // 当 visible 变 true 时, tooltipVisible 已是 true (从初始化或上次显示)

  // ====== 下一步 ======
  // 🔧 N10 v3 / N19 fix: Remove setTimeout — it was being cleared by React strict-mode
  // re-renders or by the useEffect cleanup at line 150. Direct state update instead.
  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      // Directly advance step — no setTimeout delay that can be lost
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    } else {
      // Last step — record completion & close
      // 🔧 BUG-57 fix: Demo 模式下跳过 API 调用，避免 401 错误
      if (!isDemo) {
        // 🔧 架构还债: 用 apiFetchVoid 替代内联 fetch
        // 🔧 ARCH fix (Round 21 H8 — API 失败静默, 下次登录 onboarding 重新出现):
        //    旧代码 .catch(logger.error) — 只 log, 用户下次登录看到 onboarding 重新出现。
        //    根因修复: 失败后 2s 重试一次 (best-effort), 仍失败则 log。
        apiFetchVoid('/api/user/onboarding', {
          method: 'PUT',
          body: { onboarding_completed: true },
        }).catch((err) => {
          logger.error('[onboarding] complete record failed, retrying in 2s:', err);
          // 🔧 Round 24 M6: 用 ref 跟踪 retry timer, unmount 时清理
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            apiFetchVoid('/api/user/onboarding', {
              method: 'PUT',
              body: { onboarding_completed: true },
            }).catch((err2) => logger.error('[onboarding] retry also failed:', err2));
          }, 2000);
        });
      }
      onComplete();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('symy:open-challenge-modal'));
      }
    }
  }, [currentStep, totalSteps, onComplete, isDemo]);

  // 🔧 P2-3 fix: Save display name and advance to next step
  const handleDisplayNameSubmit = useCallback(async () => {
    const trimmed = displayNameInput.trim();
    if (!trimmed || displayNameSaving) return;

    // Demo mode: just advance, don't call API
    if (isDemo) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
      return;
    }

    setDisplayNameSaving(true);
    try {
      await apiFetch<{ success: boolean }>('/api/user/display-name', {
        method: 'POST',
        body: { displayName: trimmed },
      });
      // Refresh the page to pick up new user_metadata — simplest reliable way
      // to update all components reading user.user_metadata.full_name
      logger.info('[onboarding] display name saved:', trimmed);
    } catch (err) {
      logger.error('[onboarding] display name save failed (non-blocking):', err);
      // Non-blocking: advance anyway, user can set it later in Settings
    } finally {
      setDisplayNameSaving(false);
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  }, [displayNameInput, displayNameSaving, isDemo, totalSteps]);

  // 🔧 P2-3 fix: Skip display name (user can set it later in Settings)
  const handleDisplayNameSkip = useCallback(() => {
    setDisplayNameInput('');
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []);

  // ====== 跳过导引（永久记录） ======
  // 🔧 ARCH fix (Round 12 M16): 旧代码 onComplete() 先执行 → 组件 unmount → API 调用在 unmount 后
  //    根因修复: 先发起 API 调用, 再 onComplete() (用户无感知差异, API 是 fire-and-forget)
  const handleSkip = useCallback(() => {
    // 异步记录 skip 状态（不阻塞 modal 关闭）
    if (!isDemo) {
      // 🔧 架构还债: 用 apiFetchVoid 替代内联 fetch
      // 🔧 Round 21 H8: 同 handleNext, 加重试
      apiFetchVoid('/api/user/onboarding', {
        method: 'PUT',
        body: { onboarding_completed: true },
      }).catch((err) => {
        logger.error('[onboarding] skip failed, retrying in 2s:', err);
        // 🔧 Round 24 M6: 用 ref 跟踪 retry timer, unmount 时清理
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          apiFetchVoid('/api/user/onboarding', {
            method: 'PUT',
            body: { onboarding_completed: true },
          }).catch((err2) => logger.error('[onboarding] skip retry also failed:', err2));
        }, 2000);
      });
    }
    // 🔧 Bug F fix: Demo 模式记录 localStorage
    if (isDemo) {
      try { localStorage.setItem('symy-onboarding-seen', 'true'); } catch { /* silent: non-critical operation */ }
    }
    // 🔧 ARCH fix (Round 12 M16): onComplete 在 API 调用之后 (防止 unmount 后 API 仍在执行)
    if (onSkip) onSkip();
    onComplete();
  }, [onComplete, onSkip, isDemo]);

  // ====== 计算提示卡片位置 ======
  const getTooltipStyle = (): React.CSSProperties => {
    if (isCenterStep) return {};

    if (!spotlightRect) {
      return { bottom: '120px', left: '50%', transform: 'translateX(-50%)' };
    }

    const padding = step.spotlightPadding ?? 12;
    const spotlightTop = spotlightRect.top - padding;
    const spotlightBottom = spotlightRect.bottom + padding;

    // 底部 tab bar 的元素 — 提示卡片永远放在上方
    if (spotlightBottom > window.innerHeight * 0.7) {
      return {
        bottom: `${window.innerHeight - spotlightTop + 20}px`,
        left: '50%',
        transform: 'translateX(-50%)',
      };
    }

    // 否则放在下方
    return {
      top: `${spotlightBottom + 16}px`,
      left: '50%',
      transform: 'translateX(-50%)',
    };
  };

  if (!visible) return null;

  return (
    <>
      {/* ====== 全屏遮罩层 ====== */}
      <div
        className="fixed inset-0 z-[100] transition-opacity duration-500"
        style={{ backgroundColor: isAnimating ? 'var(--onboarding-overlay)' : 'transparent' }}
        // 🔧 ARCH fix (Round 12 REACT-13 — overlay onClick 误触发永久 Skip):
        //    旧代码: onClick={handleSkip} → 用户点偏到 overlay 就永久写 DB onboarding_completed=true
        //    根因修复: 删除 onClick, 强制用户走 Skip/Next/Close 按钮 (tooltip 内有 stopPropagation 保护)
        //    这样误触不会永久关闭 onboarding, 用户下次访问还能看到导引。
      >
        {/* ====== Spotlight 高亮区域 ====== */}
        {spotlightRect && !isCenterStep && (
          <div
            className="absolute rounded-2xl transition-all duration-400 ease-out"
            style={{
              top: spotlightRect.top - (step.spotlightPadding ?? 12),
              left: spotlightRect.left - (step.spotlightPadding ?? 12),
              width: spotlightRect.width + (step.spotlightPadding ?? 12) * 2,
              height: spotlightRect.height + (step.spotlightPadding ?? 12) * 2,
              boxShadow: '0 0 0 9999px var(--onboarding-overlay)',
              border: '2px solid rgba(52, 211, 153, 0.7)',
              zIndex: 101,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 脉冲光环动画 */}
            <div className="absolute inset-[-4px] rounded-2xl border border-emerald-400/30 animate-pulse-ring" />
          </div>
        )}

        {/* ====== 连接线（从 spotlight 到 tooltip） ====== */}
        {spotlightRect && !isCenterStep && (
          <div
            className="absolute w-px bg-gradient-to-b from-emerald-400/60 to-transparent z-[101] pointer-events-none"
            style={{
              left: spotlightRect.left + spotlightRect.width / 2,
              top: spotlightRect.top - (step.spotlightPadding ?? 12) - 40,
              height: 40,
            }}
          />
        )}

        {/* ====== 提示卡片 ====== */}
        {/* 🔧 Bug E/F fix: 用 fixed + flexbox 居中 + maxHeight 确保按钮始终在视口内 */}
        <div
          ref={tooltipRef}
          className={`z-[102] transition-all duration-400 ease-out ${
            isCenterStep
              ? 'fixed inset-0 flex items-center justify-center pointer-events-none w-[88%] max-w-[380px] mx-auto'
              : 'absolute w-[88%] max-w-[380px]'
          } ${
            tooltipVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
          }`}
          style={isCenterStep
            ? { maxHeight: '85vh' }
            : { ...getTooltipStyle(), maxHeight: '85vh', overflowY: 'auto' }
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl p-6 relative overflow-hidden bg-surface-2 border border-white/20 shadow-xl shadow-black/30 pointer-events-auto max-h-[85vh] overflow-y-auto">
            {/* 顶部松柏绿装饰线 */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400" />

            {/* 欢迎页 — 大象头像 (绿色守护者语言) */}
            {isWelcomeStep && (
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center neon-glow-green relative" style={{ background: 'linear-gradient(165deg, rgba(28, 65, 48, 0.55) 0%, rgba(20, 53, 39, 0.55) 52%, rgba(12, 32, 23, 0.55) 100%)' }}>
                  <img
                    src="/symy-elephant-avatar.png"
                    alt="Symy"
                    className="w-14 h-14 rounded-full object-cover"
                  />
                  {/* 呼吸光环 */}
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-pulse-ring" />
                </div>
              </div>
            )}

            {/* 🔧 P2-3 fix: 显示名输入页 — 用户头像图标 */}
            {isDisplayNameStep && (
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center neon-glow-blue relative">
                  <User className="w-10 h-10 text-cyan-400" />
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-pulse-ring" />
                </div>
              </div>
            )}

            {/* 完成页 — 守护者称号视觉 + 真实首护仪式 */}
            {isCompleteStep && (
              <div className="flex flex-col items-center mb-4">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center neon-glow-green relative"
                  style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
                >
                  <span className="text-4xl" role="img" aria-label={t('onboarding.steps.complete.title')}>🛡️🌱</span>
                  {/* 庆祝粒子效果 */}
                  <div className="absolute inset-[-4px] rounded-full border-2 border-emerald-400/30 animate-pulse-ring" />
                  <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 animate-bounce" />
                  <Sparkles className="absolute -bottom-1 -left-1 w-4 h-4 text-cyan-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
                <p className="mt-2 text-xs font-semibold tracking-wide text-emerald-300">
                  {t('onboarding.steps.complete.title')}
                </p>
                <FirstGateList />
              </div>
            )}

            {/* 进度条 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-text-secondary font-medium">
                  {isWelcomeStep ? t('onboarding.progressLabels.welcome') : isCompleteStep ? t('onboarding.progressLabels.done') : t('onboarding.progressLabels.step', { current: currentStep, total: totalSteps - 2 })}
                </span>
                <span className="text-[11px] text-text-tertiary">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-1 bg-glass-fill rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* 图标 + 标题（非欢迎/完成/显示名页才显示小图标） */}
            {!isWelcomeStep && !isCompleteStep && !isDisplayNameStep && (
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  {step.icon}
                </div>
                <h3 className="text-lg font-bold text-text-primary">{t(step.titleKey)}</h3>
              </div>
            )}

            {/* 欢迎页/完成页/显示名页 标题 */}
            {(isWelcomeStep || isCompleteStep || isDisplayNameStep) && (
              <h3 className="text-xl font-bold text-text-primary text-center mb-3 gradient-text">{t(step.titleKey)}</h3>
            )}

            {/* 描述 */}
            <p className="text-sm text-text-secondary leading-relaxed mb-5 text-center">
              {t(step.descKey)}
            </p>

            {/* 🔧 P2-3 fix: 显示名输入框 */}
            {isDisplayNameStep && (
              <div className="mb-5">
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && displayNameInput.trim()) {
                      e.stopPropagation();
                      handleDisplayNameSubmit();
                    }
                  }}
                  placeholder={t('onboarding.steps.displayName.placeholder')}
                  maxLength={30}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-surface-1 border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  aria-label={t('onboarding.steps.displayName.title')}
                />
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <span className="text-[10px] text-text-tertiary">{displayNameInput.length}/30</span>
                </div>
              </div>
            )}

            {/* 按钮区域 */}
            {isDisplayNameStep ? (
              // 🔧 P2-3 fix: 显示名步骤 — 保存 + 跳过按钮
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDisplayNameSkip(); }}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1.5 py-2 px-1"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  {t('onboarding.steps.displayName.skipOptional')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDisplayNameSubmit(); }}
                  disabled={!displayNameInput.trim() || displayNameSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-purple-500 transition-all duration-200 active:scale-95 btn-shimmer shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {displayNameSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ...
                    </>
                  ) : (
                    <>
                      {t('onboarding.steps.displayName.saveAndContinue')}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ) : (
            <div className="flex items-center justify-between">
              {/* 跳过按钮 (非完成页显示) */}
              {!isCompleteStep && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSkip(); }}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1.5 py-2 px-1"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  {t('onboarding.skipGuide')}
                </button>
              )}

              {/* 下一步 / 完成按钮 */}
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-purple-500 transition-all duration-200 active:scale-95 btn-shimmer shadow-lg shadow-cyan-500/20"
              >
                {isCompleteStep ? (
                  <>
                    {t('onboarding.getStarted')}
                    <Sparkles className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    {isWelcomeStep ? t('onboarding.startTour') : t('onboarding.next')}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            )}

            {/* 完成页 — "不再提醒" 按钮 */}
            {isCompleteStep && (
              <div className="mt-4 pt-3 border-t border-glass-border text-center">
                <button
                  onClick={handleSkip}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors inline-flex items-center gap-1.5 py-2"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  {t('onboarding.dontShowAgain')}
                </button>
              </div>
            )}

            {/* 关闭按钮（右上角） */}
            <button
              onClick={(e) => { e.stopPropagation(); handleSkip(); }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-glass-fill hover:bg-glass-fill-strong flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
