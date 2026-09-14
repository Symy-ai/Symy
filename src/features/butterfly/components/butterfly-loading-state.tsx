'use client';

/**
 * ButterflyLoadingState — 蝴蝶效应加载状态组件 (P1-1 fix)
 *
 * 抽出 butterfly-tab.tsx 的加载状态渲染, 减少 butterfly-tab 行数.
 *
 * 功能:
 * - 阶段提示轮播 (每 8s 切换)
 * - 进度条 (90s 内从 0% 到 95%)
 * - 实时已用时间显示
 * - 超 60s 显示耐心提示
 *
 * 父组件负责管理 stageIndex/elapsedSec state 与 useEffect timers,
 * 本组件纯展示.
 */

import { useI18n } from '@/i18n/provider';

interface ButterflyLoadingStateProps {
  isLight: boolean;
  stageIndex: number;
  elapsedSec: number;
  /** 🔧 P0-5 fix: 取消回调 — 60s 后显示「取消并退款」按钮 */
  onCancel?: () => void;
}

const LOADING_STAGES = [
  { emoji: '🎭', key: 'loadingStage1', defaultText: 'Understanding your decision...' },
  { emoji: '📜', key: 'loadingStage2', defaultText: 'Outlining the two universes...' },
  { emoji: '✍️', key: 'loadingStage3', defaultText: 'Writing the first chapter...' },
  { emoji: '🎨', key: 'loadingStage4', defaultText: 'Painting the scenes...' },
  { emoji: '🦋', key: 'loadingStage5', defaultText: 'Weaving the butterfly effect...' },
] as const;

export function ButterflyLoadingState({ isLight, stageIndex, elapsedSec, onCancel }: ButterflyLoadingStateProps) {
  const { t } = useI18n();

  // 进度条: 90 秒内从 0% 到 95% (剩余 5% 留给最终完成)
  const progress = Math.min(95, (elapsedSec / 90) * 100);
  const currentStage = LOADING_STAGES[stageIndex % LOADING_STAGES.length];
  const showPatienceHint = elapsedSec >= 60;

  return (
    <div className={`h-full flex flex-col items-center justify-center ${isLight ? 'bg-gray-50' : 'bg-surface-1'} gap-4 px-6`}>
      <div className="text-4xl animate-pulse">{currentStage.emoji}</div>

      {/* 三点跳动动画 */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {/* 阶段文案 */}
      <span className={`text-sm font-medium text-center ${isLight ? 'text-gray-700' : 'text-text-primary'}`}>
        {t(`butterfly.${currentStage.key}`, { defaultValue: currentStage.defaultText })}
      </span>

      {/* 进度条 */}
      <div className={`w-full max-w-xs h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-gray-200' : 'bg-glass-fill'}`}>
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 时间提示 */}
      <div className="text-center space-y-1">
        <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
          {t('butterfly.weavingHint', { defaultValue: 'This usually takes 30-90 seconds. Hang tight!' })}
        </span>
        <div className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-text-tertiary/60'}`}>
          {elapsedSec > 0 && (
            <span>{t('butterfly.elapsedTime', { defaultValue: `Elapsed: ${elapsedSec}s`, sec: elapsedSec })}</span>
          )}
        </div>
      </div>

      {/* 超时耐心提示 */}
      {showPatienceHint && (
        <div className={`text-xs text-center px-4 py-2 rounded-lg ${isLight ? 'bg-amber-50 text-amber-700' : 'bg-amber-500/10 text-amber-400'}`}>
          {t('butterfly.patienceHint', { defaultValue: 'Taking longer than expected. The story is worth the wait — thank you for your patience.' })}
        </div>
      )}

      {/* 🔧 P0-5 fix: 60s 后显示「取消并退款」按钮 — 不强制用户等到 150s */}
      {showPatienceHint && onCancel && (
        <button
          onClick={onCancel}
          className={`mt-2 px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
            isLight
              ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
              : 'border-glass-border text-text-secondary hover:bg-glass-fill'
          }`}
        >
          {t('butterfly.cancelAndRefund', { defaultValue: 'Cancel & refund pull' })}
        </button>
      )}
    </div>
  );
}
