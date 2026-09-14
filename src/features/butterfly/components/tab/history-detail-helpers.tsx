/**
 * History Detail Helpers — StatBox + DetailHeader components
 *
 * 提取自 src/features/butterfly/components/butterfly-history-detail.tsx (Round 103 拆分)
 */

import { useI18n } from '@/i18n/provider';

export function StatBox({
  icon,
  label,
  value,
  isLight,
}: {
  icon: string;
  label: string;
  value: string;
  isLight: boolean;
}) {
  return (
    <div className={`rounded-xl p-2.5 ${isLight ? 'bg-gray-50' : 'bg-glass-fill-strong'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-xs">{icon}</span>
        <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>{label}</span>
      </div>
      <p className={`text-base font-bold font-mono ${isLight ? 'text-gray-800' : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

export function DetailHeader({
  isLight,
  onBack,
  title,
}: {
  isLight: boolean;
  onBack: () => void;
  title: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`flex-shrink-0 flex items-center px-4 py-3 border-b ${isLight ? 'border-gray-200 bg-white' : 'border-glass-border bg-glass-fill'}`}>
      <button
        onClick={onBack}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${isLight ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-glass-fill-strong text-text-secondary'}`}
        aria-label={t('common.back', { defaultValue: 'back' })}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
          <path d="M10 12L6 8l4-4v8z" />
        </svg>
        <span className="text-sm">{title}</span>
      </button>
    </div>
  );
}
