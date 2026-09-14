'use client';

/**
 * DepositDialog — 挑战通过后的 Dream Fund 信任存入弹窗
 *
 * 用户选择是否将省下的钱存入 Dream Fund:
 * - 存入: dream fund 进度上涨 + 庆祝动画 + 额外代币
 * - 跳过: 温和提示, 不影响挑战奖励
 *
 * 🔧 DM-1 fix: i18n messages 已加 `$` 前缀, t() 直接插值即可, 不再需要 .replace() 兜底
 * 🔧 DM-5 fix: 合并 phase + depositResult 为单一 `view` state, 避免 race condition
 *   旧代码: phase='celebrating' && depositResult=null 时 return null → 庆祝动画不显示
 *   新代码: view.type='celebrating' 时 view.data 一定非 null (类型保证), 无 race
 * 🔧 DM-6 fix: 用 ref guard 防止重复 deposit/skip API 调用
 *   旧代码: loading state 异步, 用户快速双击/React 19 concurrent 可能在 setState 前重复触发
 *   新代码: depositCallRef/skipCallRef 同步检查, 第一次调用立即标记, 后续调用直接 return
 * 🔧 DM-5-FINAL fix (Round 6): 用户报告 "存款后无庆祝模态框"
 *   根因分析 (浏览器实测 + console log):
 *     1. 庆祝模态框确实会渲染 (render 17 view=celebrating), 但只持续 2.5s
 *     2. 如果用户在 deposit API 等待期间不小心点击 dialog 外部, safeClose 会立即关闭 dialog
 *        → API 成功后 setView(celebrating) 在已卸载的组件上调用 → 无视觉效果
 *     3. 2.5s 持续时间可能太短, 用户一眨眼就错过了
 *   修复:
 *     A. loading 状态下禁止点击外部关闭 (onClick={loading ? undefined : safeClose})
 *     B. 庆祝模态框持续时间从 2.5s 增加到 4s
 *     C. 庆祝模态框加 "Continue" 按钮, 让用户手动关闭 (而非只能等待)
 *     D. 庆祝模态框加 confetti 动画效果, 更明显
 *     E. 409 路径也用 4s (之前是 2s, 太短)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { SAVINGS_FUND_TARGET } from '@/lib/buddy-defaults';

export interface DepositDialogProps {
  challengeId: string;
  savedAmount: number;
  /** 🔧 P0 fix: 预先传入目标基金名 (客户端从 buddyState.dreamFunds 算出), 用于按钮显示 */
  fundName?: string;
  /** 🔧 P0 fix: 预先传入目标基金 emoji */
  fundEmoji?: string;
  /** 🔧 PM-P0-1 fix: 预先传入目标基金 ID, 传给后端确保分配到正确 fund */
  fundId?: string;
  onClose: () => void;
  onDeposited?: (result: {
    fundId: string;
    fundName: string;
    fundEmoji: string;
    amount: number;
    newCurrent: number;
    target: number;
    progress: number;
    goalReached: boolean;
    bonusTokens: number;
  }) => void;
  onSkipped?: () => void;
}

interface DepositResult {
  fundName: string;
  fundEmoji: string;
  newCurrent: number;
  target: number;
  progress: number;
  goalReached: boolean;
  bonusTokens: number;
}

// 🔧 DM-5 fix: 单一 view state, 避免多 state race condition
type View =
  | { type: 'choice' }
  | { type: 'celebrating'; data: DepositResult }
  | { type: 'skipped' }
  | { type: 'error'; message: string };

// 🔧 DM-5-FINAL: 庆祝模态框持续时间从 2.5s 增加到 4s
//   旧值 2.5s 太短 — 用户一眨眼就错过, 误以为 "无庆祝模态框"
//   新值 4s 给用户足够时间看到存入反馈 + 进度条 + bonus tokens
const CELEBRATION_DURATION_MS = 4000;
const SKIP_DURATION_MS = 3000;

export function DepositDialog({ challengeId, savedAmount, fundName, fundEmoji, fundId, onClose, onDeposited, onSkipped }: DepositDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState<'deposit' | 'skip' | null>(null);
  const [view, setView] = useState<View>({ type: 'choice' });

  // 🔧 DM-6 fix: ref guard 防止重复 API 调用 (loading state 异步, 双击可能漏过)
  const depositCallRef = useRef(false);
  const skipCallRef = useRef(false);
  // 🔧 DM-5 fix: 跟踪 onClose 是否已触发, 防止 setTimeout 重复调用
  const onCloseRef = useRef(false);
  // 🔧 ARCH fix (Round 28 AUDIT-5 MEDIUM-6): track auto-close timers for cleanup
  //    旧代码: 3 处 setTimeout(safeClose, ...) 未保存 → 卸载后 setState on unmounted
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔧 MEDIUM-6: cleanup auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, []);

  const safeClose = useCallback(() => {
    if (onCloseRef.current) return;
    onCloseRef.current = true;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

  const handleDeposit = useCallback(async () => {
    // 🔧 DM-6 fix: 同步 ref guard, 防止双击/React concurrent 重复触发
    if (depositCallRef.current || skipCallRef.current) return;
    depositCallRef.current = true;
    setLoading('deposit');
    try {
      const data = await apiFetch<{
        success: boolean;
        action: string;
        fundId: string;
        fundName: string;
        fundEmoji: string;
        amount: number;
        newCurrent: number;
        target: number;
        progress: number;
        goalReached: boolean;
        bonusTokens: number;
      }>('/api/buddy/deposit', {
        method: 'POST',
        // 🔧 PM-P0-1 fix: 传 fundId 给后端, 确保分配到前端显示的 fund
        body: { challengeId, action: 'deposit', fundId },
      });

      // 🔧 DM-5 fix: 一次 setView 调用, 数据和 phase 绑定, 无 race
      setView({
        type: 'celebrating',
        data: {
          fundName: data.fundName,
          fundEmoji: data.fundEmoji,
          newCurrent: data.newCurrent,
          target: data.target,
          progress: data.progress,
          goalReached: data.goalReached,
          bonusTokens: data.bonusTokens,
        },
      });
      onDeposited?.(data);

      // 🔧 DM-5-FINAL: 4s 后自动关闭 (之前 2.5s 太短)
      // 🔧 MEDIUM-6: save timer ref for cleanup
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        autoCloseTimerRef.current = null;
        safeClose();
      }, CELEBRATION_DURATION_MS);
    } catch (err) {
      logger.error('[DepositDialog] Deposit failed:', err);
      // 🔧 DM-2 fix: 409 = already deposited → 视为成功 (幂等), 显示庆祝动画
      // 🔧 DM-5 fix: 409 路径也用单一 setView, 数据和 phase 绑定
      if (err && typeof err === 'object' && 'status' in err && err.status === 409) {
        setView({
          type: 'celebrating',
          data: {
            fundName: t('buddy.dreamFunds', { defaultValue: 'your fund' }),
            fundEmoji: '🎯',
            newCurrent: 0,
            target: 0,
            progress: 0,
            goalReached: false,
            bonusTokens: 0,
          },
        });
        // 🔧 DM-5-FINAL: 409 路径也用 4s (之前 2s 太短)
        // 🔧 MEDIUM-6: save timer ref for cleanup
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => {
          autoCloseTimerRef.current = null;
          safeClose();
        }, CELEBRATION_DURATION_MS);
      } else {
        setView({
          type: 'error',
          message: t('chat.deposit.error', { defaultValue: 'Failed. Try again.' }),
        });
        // 🔧 DM-6 fix: error 路径重置 ref, 允许用户重试
        depositCallRef.current = false;
        setLoading(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [challengeId, safeClose, onDeposited, t]);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleSkip = useCallback(async () => {
    // 🔧 DM-6 fix: 同步 ref guard
    if (skipCallRef.current || depositCallRef.current) return;
    skipCallRef.current = true;
    setLoading('skip');
    try {
      await apiFetch('/api/buddy/deposit', {
        method: 'POST',
        body: { challengeId, action: 'skip' },
      });
      setView({ type: 'skipped' });
      onSkipped?.();

      // 3 秒后自动关闭 (让用户有时间看到温和提示)
      // 🔧 MEDIUM-6: save timer ref for cleanup
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        autoCloseTimerRef.current = null;
        safeClose();
      }, SKIP_DURATION_MS);
    } catch (err) {
      logger.error('[DepositDialog] Skip failed:', err);
      // Skip 失败不阻塞用户, 直接关闭
      safeClose();
    }
  }, [challengeId, safeClose, onSkipped]);

  // 庆祝动画 (DM-5 fix: view.type === 'celebrating' 时 view.data 一定存在)
  // 🔧 DM-5-FINAL: 加 Continue 按钮 + confetti 动画, 让庆祝更明显且可手动关闭
  if (view.type === 'celebrating') {
    const { data } = view;
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        {/* 🔧 DM-5-FINAL: confetti 装饰 — 6 个彩色圆点从顶部飘落 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {['🎉', '✨', '🎊', '💫', '⭐', '🥳'].map((emoji, i) => (
            <div
              key={i}
              className="absolute text-2xl animate-bounce"
              style={{
                left: `${10 + i * 15}%`,
                top: `${5 + (i % 3) * 10}%`,
                animationDelay: `${i * 100}ms`,
                animationDuration: `${1000 + i * 200}ms`,
              }}
            >
              {emoji}
            </div>
          ))}
        </div>
        <div className="relative w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 space-y-4 bg-surface-2 border border-cyan-500/30 shadow-2xl text-center animate-in zoom-in-50 duration-300">
          {/* 庆祝动画 */}
          <div className="text-6xl animate-bounce">🎉</div>
          <h2 className="text-xl font-bold gradient-text">
            {t('chat.deposit.celebrationTitle', { defaultValue: 'You saw it.' })}
          </h2>
          <p className="text-sm text-text-secondary">
            ${savedAmount.toFixed(2)} → {data.fundEmoji} {data.fundName}
          </p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-text-tertiary">
              <span>${data.newCurrent.toLocaleString()}</span>
              <span>{data.target >= SAVINGS_FUND_TARGET ? '∞' : `$${data.target.toLocaleString()}`}</span>
            </div>
            <div className="h-2 bg-glass-fill rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-700 ease-out"
                style={{ width: `${Math.min(100, data.progress)}%` }}
              />
            </div>
          </div>
          {data.goalReached && (
            <p className="text-sm font-bold text-cyan-400 animate-pulse">
              {t('chat.deposit.goalReached', { defaultValue: 'Goal Reached! 🎉' })}
            </p>
          )}
          {/* 🔧 P2 fix (mirror philosophy): 弱化代币显示 — 镜子哲学下"看见"本身就是奖励
              旧代码: "+{X} bonus tokens" (强调代币, 让用户为代币而"看见")
              新代码: "Your seeing, remembered." (强调"看见"被记住)
              代币数字仍可见 (text-text-tertiary/60), 但不强调 */}
          <p className="text-xs text-text-tertiary">
            {t('chat.deposit.seeingRemembered', { defaultValue: 'Your seeing, remembered.' })}
          </p>
          <p className="text-[10px] text-text-tertiary/60">
            +{data.bonusTokens} {t('chat.deposit.bonusTokens', { defaultValue: 'bonus tokens' })}
          </p>
          {/* 🔧 DM-5-FINAL: Continue 按钮 — 让用户手动关闭, 不必等待 4s */}
          <button
            onClick={safeClose}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-[0.98] cursor-pointer mt-2"
          >
            {t('chat.deposit.continueButton', { defaultValue: 'Continue →' })}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // 跳过动画
  if (view.type === 'skipped') {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="relative w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 space-y-3 bg-surface-2 border border-glass-border shadow-2xl text-center">
          <div className="text-3xl">💪</div>
          <p className="text-sm text-text-secondary">
            {t('chat.deposit.skipMessage', { defaultValue: "The money in your pocket is also your freedom." })}
          </p>
        </div>
      </div>,
      document.body
    );
  }

  // 错误状态
  if (view.type === 'error') {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={safeClose}>
        <div className="relative w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 space-y-3 bg-surface-2 border border-red-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="text-3xl text-center">⚠️</div>
          <p className="text-sm text-red-400 text-center">{view.message}</p>
          <button
            onClick={() => { setView({ type: 'choice' }); }}
            className="w-full py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-sm font-medium hover:bg-glass-fill-strong transition-all cursor-pointer"
          >
            {t('common.tryAgain', { defaultValue: 'Try Again' })}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // 选择卡 (默认)
  // 🔧 DM-5-FINAL: loading 状态下禁止点击外部关闭
  //   旧代码: onClick={safeClose} — 用户在 deposit API 等待期间不小心点击外部 → dialog 关闭
  //          → API 成功后 setView(celebrating) 在已卸载组件上调用 → 无庆祝模态框
  //   新代码: loading !== null 时 onClick={undefined} — 必须点按钮才能关闭
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={loading !== null ? undefined : safeClose}
    >
      <div
        className="relative w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 space-y-4 bg-surface-2 border border-glass-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="text-center space-y-1">
          <div className="text-4xl">🎉</div>
          <h2 className="text-lg font-bold gradient-text">
            {/* 🔧 DM-1 fix (final): $ 符号由代码控制 (amount 参数传 `$${amount}`), 不依赖 i18n messages 格式
               旧代码 .replace('{amount}', '$' + ...) 无效 — ICU 插值后 {amount} 已被替换, .replace 不匹配
               新代码: t() 调用时 amount 参数 = `$` + 金额, ICU 插值后直接显示 `$20.00` */}
            {t('chat.deposit.title', { amount: `$${savedAmount.toFixed(2)}`, defaultValue: `You saw it. $${savedAmount.toFixed(2)} stays.` })}
          </h2>
          <p className="text-xs text-text-tertiary">
            {t('chat.deposit.subtitle', { defaultValue: 'Where does it go?' })}
          </p>
          {/* 🔧 PM-P1-6 fix: 加解释说明, 让用户理解两个选项的含义 */}
          <p className="text-[11px] text-text-tertiary/70 mt-1 leading-snug">
            {t('chat.deposit.explanation', { defaultValue: 'Choose a dream you\'re building. The money you didn\'t spend becomes progress toward it. Or keep it as free savings.' })}
          </p>
        </div>

        {/* 主按钮: 存入 */}
        <button
          onClick={handleDeposit}
          disabled={loading !== null}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] btn-shimmer"
        >
          {loading === 'deposit'
            ? t('chat.deposit.processing', { defaultValue: 'Seeing...' })
            : t('chat.deposit.depositButton', {
                amount: `$${savedAmount.toFixed(2)}`,
                fundName: fundEmoji && fundName ? `${fundEmoji} ${fundName}` : (fundName || t('chat.deposit.yourFund', { defaultValue: 'your fund' })),
                defaultValue: `✅ {amount} → {fundName}`,
              })
          }
        </button>

        {/* 次按钮: 跳过 */}
        <button
          onClick={handleSkip}
          disabled={loading !== null}
          className="w-full py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'skip'
            ? t('chat.deposit.processing', { defaultValue: 'Seeing...' })
            : t('chat.deposit.skipButton', { defaultValue: 'Keep it in my freedom' })
          }
        </button>
      </div>
    </div>,
    document.body
  );
}
