/**
 * Loading state for root route segment
 * Shows while page data is being fetched (prevents white screen during navigation)
 */
import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations();
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="text-2xl" aria-hidden="true">🐘</div>
        <div className="w-12 h-12 rounded-full border-4 border-glass-fill border-t-emerald-500 animate-spin" />
        <p className="text-sm text-text-tertiary">{t('loading.message')}</p>
      </div>
    </div>
  );
}
