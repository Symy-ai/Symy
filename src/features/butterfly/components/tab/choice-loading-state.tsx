/**
 * ChoiceLoadingState — 选择加载状态 + Retry 按钮.
 *
 * 🔧 Round 80 F7: extracted from butterfly-tab.tsx (was 843 lines, target <800).
 *    Bug 3 fix (P0): 用户卡在 'Preparing your choice...' 20s, 无 escape hatch.
 *    8s 后显示 Retry 按钮, 用户可手动触发 retryChoice (DB reload + fallback).
 */

'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/i18n/provider';

export interface ChoiceLoadingStateProps {
  isLight: boolean;
  onRetry: () => void;
}

export function ChoiceLoadingState({ isLight, onRetry }: ChoiceLoadingStateProps) {
  const { t } = useI18n();
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    // 8s 后显示 Retry 按钮 (20s timeout 是最后兜底, 8s 给用户主动权)
    const tid = setTimeout(() => setShowRetry(true), 8000);
    return () => clearTimeout(tid);
  }, []);

  return (
    <div className={`absolute inset-0 z-30 flex items-end backdrop-blur-sm ${isLight ? 'bg-white/70' : 'bg-black/70'}`}>
      <div className="w-full px-4 py-8 text-center">
        <div className="flex gap-1.5 justify-center mb-3">
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className={`text-sm ${isLight ? 'text-purple-700' : 'text-purple-300'} tracking-wide`}>
          {t('butterfly.preparingChoice')}
        </span>
        {showRetry && (
          <div className="mt-4">
            <button
              onClick={onRetry}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                isLight
                  ? 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-300'
                  : 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30'
              }`}
            >
              🔄 {t('butterfly.retryChoice', { defaultValue: 'Tap to retry loading choices' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
