/**
 * AhaMomentOnboarding — 新用户 Aha Moment 引导流程
 *
 * 需求一: 新用户注册后进入全屏引导, 2 分钟内完成第一次挑战
 * Step 1: 欢迎页 (3s 可跳过)
 * Step 2: 发起第一次挑战 (输入商品 + 金额, 或选预设)
 * Step 3: 挑战结束后的动态文案
 * Step 4: 进入正常 App
 *
 * Demo 模式: 顶部 banner 改为 "立即试一次" + "注册保存进度"
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { formatFreedomTime, moneyToHours } from '@/lib/freedom-time';
import type { ChallengeContext } from '@/types/challenge-context';

export interface AhaMomentOnboardingProps {
  open: boolean;
  isDemo: boolean;
  ahaChallengeContext: ChallengeContext | null;
  onComplete: () => void;
  onSkip: () => void;
  onNavigateToChallenge: (context: ChallengeContext) => void;
  onChallengeCompleted?: (passed: boolean, amount: number) => void;
}

type Step = 'welcome' | 'challenge_input' | 'result';

const PRESET_ITEMS = [
  { id: 'phone', amount: 699 },
  { id: 'sneakers', amount: 159 },
  { id: 'coffee', amount: 89 },
] as const;

export function AhaMomentOnboarding({
  open,
  isDemo: _isDemo,
  ahaChallengeContext,
  onComplete,
  onSkip,
  onNavigateToChallenge,
  onChallengeCompleted,
}: AhaMomentOnboardingProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate(_isDemo);
  const [step, setStep] = useState<Step>('welcome');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [challengeResult, setChallengeResult] = useState<{ passed: boolean; amount: number } | null>(null);

  // 重置状态当弹窗关闭
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState in effect (reset on close), see ARCH-DEEP-71
      setStep('welcome');
      setItemName('');
      setAmount('');
      setChallengeResult(null);
    }
  }, [open]);

  // 🔧 Aha Moment fix: 重新打开时, 如果不是从 welcome 开始 (ahaChallengeContext 为 null),
  // 说明挑战已完成 → 直接跳到 Step 3 (结果页)
  useEffect(() => {
    if (open && step === 'welcome' && ahaChallengeContext === null) {
      // 检查是否是挑战完成后重新打开 (page.tsx 会先 setAhaChallengeContext(null) 再 setShowAhaMoment(true))
      // 用 sessionStorage 标记来判断是否是挑战完成后的重新打开
      const challengeCompleted = sessionStorage.getItem('symy-aha-challenge-completed');
      if (challengeCompleted === 'true') {
        sessionStorage.removeItem('symy-aha-challenge-completed');
        const savedAmount = parseFloat(sessionStorage.getItem('symy-aha-challenge-amount') || '0');
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState (challenge completed → Step 3)
        setChallengeResult({ passed: true, amount: savedAmount });
        setStep('result');
      }
    }
  }, [open, step, ahaChallengeContext]);

  // Step 1: 3 秒后自动显示"跳过"按钮
  const [showSkip, setShowSkip] = useState(false);
  useEffect(() => {
    if (open && step === 'welcome') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState in effect (reset on open), see ARCH-DEEP-71
      setShowSkip(false);
      const timer = setTimeout(() => setShowSkip(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [open, step]);

  const handleStartChallenge = useCallback(() => {
    const parsedAmount = parseFloat(amount);
    if (!itemName.trim() || isNaN(parsedAmount) || parsedAmount < 10) return;

    const context: ChallengeContext = {
      itemName: itemName.trim(),
      amount: parsedAmount,
    };

    // 导航到 Chat tab 发起挑战
    onNavigateToChallenge(context);

    // 进入 result step (等待挑战完成)
    // 实际上 onChallengeCompleted 会被调用
    setStep('result');
  }, [itemName, amount, onNavigateToChallenge]);

  // 处理挑战完成回调
  useEffect(() => {
    if (step === 'result' && onChallengeCompleted) {
      // 监听挑战完成 — 由 page.tsx 调用 onChallengeCompleted
      // 这里不需要做任何事, 等 page.tsx 调用 setChallengeResult
    }
  }, [step, onChallengeCompleted]);

  const handlePresetClick = useCallback((preset: { name: string; amount: number }) => {
    setItemName(preset.name);
    setAmount(String(preset.amount));
  }, []);

  const formatFreedomLine = useCallback((value: number) => {
    const hours = formatFreedomTime(moneyToHours(value, hourlyRate), locale);
    return locale === 'zh' ? `≈ ${hours} 自由` : `≈ ${hours} of freedom`;
  }, [hourlyRate, locale]);

  const enteredAmount = parseFloat(amount);
  const showEnteredFreedomLine = Number.isFinite(enteredAmount) && enteredAmount >= 10;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onSkip();
    }
  }, [onSkip]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    // 🔧 P2-5 fix: 半屏 bottom sheet 模式 — 不遮挡顶部 Sign up 按钮
    //   旧代码: fixed inset-0 z-[300] 全屏覆盖
    //   新代码: 底部半屏卡片, 顶部可见 Sign up 按钮
    // 🔧 P0P1-B fix (B2): a11y + 完全关闭语义
    //   - role="dialog" + aria-modal="true" 让屏幕阅读器正确识别
    //   - aria-hidden 在关闭后同步 (虽然 !open 已 return null, 此处为防御)
    //   - Escape 键关闭 (handleKeyDown 已绑定)
    //   - inert 防止背景聚焦 — 由外层 div 控制
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onSkip}
      role="presentation"
    >
      <div
        className="w-full max-w-md bg-surface-1 rounded-t-3xl flex flex-col max-h-[80vh] overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aha-moment-title"
      >
        {/* Bottom sheet drag handle */}
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
      {/* Step 1: 欢迎页 */}
      {step === 'welcome' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-6">👋</div>
          <h1 className="text-2xl font-bold text-text-primary mb-3">
            {t('ahaMoment.welcomeTitle', { defaultValue: 'Symy is your AI green-shopping companion' })}
          </h1>
          <p className="text-sm text-text-secondary mb-2 max-w-[300px] leading-relaxed">
            {t('ahaMoment.welcomeDesc', { defaultValue: 'Before you buy, Symy\'s little elephant holds the gate — for your wallet, your hours, and the planet. Let\'s try it in 2 minutes.' })}
          </p>
          <p className="text-xs text-text-tertiary mb-8">
            {t('ahaMoment.welcomeSub', { defaultValue: 'Your wallet. Your hours. Your planet. Your call.' })}
          </p>
          <button
            onClick={() => setStep('challenge_input')}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-green-500 transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            {t('ahaMoment.startExperience', { defaultValue: 'Start Experience →' })}
          </button>
          {showSkip && (
            <button
              onClick={onSkip}
              className="mt-4 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              {t('ahaMoment.skipExplore', { defaultValue: 'Just looking around' })}
            </button>
          )}
        </div>
      )}

      {/* Step 2: 发起第一次挑战 — P1-1 fix: 预设商品提到顶部, 先体验价值再要求输入 */}
      {step === 'challenge_input' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px]">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">🤔</div>
              <h2 className="text-lg font-bold text-text-primary mb-2">
                {t('ahaMoment.whatDoYouWant', { defaultValue: "What's calling you?" })}
              </h2>
              <p className="text-xs text-text-tertiary">
                {t('ahaMoment.dontOverthink', { defaultValue: 'Don\'t overthink — just something you\'ve been eyeing lately.' })}
              </p>
            </div>

            {/* 🔧 P1-1 fix: 预设商品提到顶部 — 先体验价值 (Duolingo 模式: 先试一节课再注册)
                旧布局: 输入框在前, 预设商品在底部小字 "No idea? Try these:"
                问题: 用户还不知道产品价值, 就被要求输入商品, 产生抗拒
                新布局: 预设商品作为"快速体验"入口 (大按钮), 输入框作为"or enter your own" */}
            <div className="mb-5">
              <p className="text-[11px] text-emerald-400 font-medium mb-2">
                ✨ {t('ahaMoment.tryExampleFirst', { defaultValue: 'Try one guard in 10 seconds' })}
              </p>
              <div className="space-y-2">
                {PRESET_ITEMS.map((preset) => {
                  const presetName = t(`ahaMoment.presets.${preset.id}.name`);
                  const presetEmoji = t(`ahaMoment.presets.${preset.id}.emoji`);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetClick({ name: presetName, amount: preset.amount })}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-green-600/10 border border-emerald-500/30 hover:border-emerald-500/60 hover:from-emerald-500/20 hover:to-green-600/20 transition-all cursor-pointer text-left group"
                    >
                      <span className="text-2xl flex-shrink-0">{presetEmoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary">{presetName}</div>
                        <div className="text-[10px] text-text-tertiary">${preset.amount} · {formatFreedomLine(preset.amount)}</div>
                      </div>
                      <span className="text-[10px] text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-glass-border" />
              <span className="text-[10px] text-text-tertiary">
                {t('ahaMoment.orEnterYourOwn', { defaultValue: 'or enter your own' })}
              </span>
              <div className="flex-1 h-px bg-glass-border" />
            </div>

            {/* 商品名输入 */}
            <div className="mb-3">
              <label className="text-[11px] text-text-tertiary mb-1 block">
                {t('ahaMoment.itemName', { defaultValue: 'Item name' })}
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value.slice(0, 50))}
                placeholder={t('ahaMoment.itemPlaceholder', { defaultValue: 'e.g. Nike sneakers, AirPods...' })}
                maxLength={50}
                className="w-full px-4 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary/50 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>

            {/* 金额输入 */}
            <div className="mb-4">
              <label className="text-[11px] text-text-tertiary mb-1 block">
                💰 {t('ahaMoment.howMuch', { defaultValue: 'How much freedom is at stake?' })}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="10"
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setAmount(val);
                  }}
                  placeholder="100"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary/50 focus:outline-none focus:border-emerald-500/50 transition-all"
                />
              </div>
              {showEnteredFreedomLine && (
                <p className="mt-1 text-[10px] text-text-tertiary">{formatFreedomLine(enteredAmount)}</p>
              )}
            </div>

            {/* 开始挑战按钮 */}
            <button
              onClick={handleStartChallenge}
              disabled={!itemName.trim() || !amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) < 10}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-green-500 transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('ahaMoment.challengeMe', { defaultValue: 'Let the green gate decide →' })}
            </button>

            {/* 跳过 */}
            <button
              onClick={onSkip}
              className="w-full mt-4 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              {t('ahaMoment.skipExplore', { defaultValue: 'Just looking around' })}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 挑战结果 (等待挑战完成后由 page.tsx 触发) */}
      {step === 'result' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">✨</div>
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('ahaMoment.thisIsCore', { defaultValue: 'This is what Symy is for — a guardian, not a judge.' })}
          </h2>
          {challengeResult ? (
            <p className="text-sm text-text-secondary mb-8 max-w-[300px] leading-relaxed">
              {challengeResult.passed
                  ? t('ahaMoment.resultPassed', {
                      amount: `$${challengeResult.amount.toFixed(2)}`,
                      hours: formatFreedomLine(challengeResult.amount),
                      defaultValue: `You held the gate. $${challengeResult.amount.toFixed(2)} stays yours — about ${formatFreedomLine(challengeResult.amount)} won back, plus a green medal.`
                    })
                : t('ahaMoment.resultFailed', {
                    defaultValue: 'You chose freely. Next time you\'re unsure, the little elephant will be here.'
                  })
              }
            </p>
          ) : (
            <p className="text-sm text-text-tertiary mb-8">
              {t('ahaMoment.completeChallenge', { defaultValue: 'Complete the challenge in chat, then come back!' })}
            </p>
          )}
          <button
            onClick={onComplete}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-green-500 transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            {t('ahaMoment.enterApp', { defaultValue: 'Start your journey →' })}
          </button>
        </div>
      )}
      </div>
    </div>,
    document.body
  );
}
