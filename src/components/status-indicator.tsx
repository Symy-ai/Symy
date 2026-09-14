'use client';

import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/provider';

export type AppStatus = 'stable' | 'alert' | 'success';

interface StatusIndicatorProps {
  status: AppStatus;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  onClick?: () => void;
}

const statusConfig = {
  stable: {
    // 🔧 BUG-276 fix: 使用双主题类替代硬编码 hex 颜色 (绿色环保主题: 松柏绿)
    bgColor: 'bg-emerald-800 dark:bg-[#1c4130]',
    textColor: 'text-white',
    borderColor: 'border-emerald-800/50 dark:border-[#1c4130]',
    glow: 'shadow-[0_0_20px_rgba(28,65,48,0.5)]',
  },
  alert: {
    bgColor: 'bg-red-600 dark:bg-[#C0392B]',
    textColor: 'text-white',
    borderColor: 'border-red-600/50 dark:border-[#C0392B]',
    glow: 'shadow-[0_0_25px_rgba(192,57,43,0.6)]',
  },
  success: {
    bgColor: 'bg-green-600 dark:bg-[#27AE60]',
    textColor: 'text-white',
    borderColor: 'border-green-600/50 dark:border-[#27AE60]',
    glow: 'shadow-[0_0_25px_rgba(39,174,96,0.6)]',
  },
};

const sizeConfig = {
  sm: 'px-3 py-1.5 text-xs rounded-full',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-8 py-4 text-2xl rounded-2xl',
};

export function StatusIndicator({ status, size = 'md', animated = true, onClick }: StatusIndicatorProps) {
  const { t } = useI18n();
  const config = statusConfig[status];
  const statusTexts = {
    stable: t('status.symyStable'),
    alert: t('status.symyAlert'),
    success: t('status.symySuccess'),
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-mono font-bold tracking-wider transition-all duration-500 border-2',
        config.bgColor,
        config.textColor,
        config.borderColor,
        config.glow,
        sizeConfig[size],
        animated && status === 'alert' && 'animate-pulse shake-animation',
        animated && status === 'success' && 'animate-bounce',
        onClick && 'cursor-pointer hover:scale-105 active:scale-95'
      )}
    >
      {statusTexts[status]}
    </button>
  );
}

export function StatusText({ status, count }: { status: AppStatus; count?: number }) {
  const { t } = useI18n();
  const labels = {
    stable: t('status.allClear', { n: count ?? 0 }),
    alert: t('status.impulseAlert'),
    success: t('status.interventionSuccess'),
  };
  const colors = {
    // 🔧 BUG-276 fix: 使用双主题类替代硬编码 hex 颜色
    stable: 'text-emerald-700 dark:text-emerald-300',
    alert: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  };

  return (
    <p className={cn('text-sm font-medium mt-1', colors[status])}>
      {labels[status]}
    </p>
  );
}
