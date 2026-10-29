'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/lib/toast';

interface BindCodeResponse {
  code?: string;
  deepLink?: string | null;
  error?: string;
}

export default function ChannelsSettingsPage() {
  const t = useTranslations('settingsChannels');
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateCode() {
    setLoading(true);
    try {
      const response = await fetch('/api/channels/bind/code', { method: 'POST' });
      const data = (await response.json()) as BindCodeResponse;
      if (!response.ok) throw new Error(data.error ?? 'failed');
      setCode(data.code ?? null);
      setDeepLink(data.deepLink ?? null);
      showToast(t('generated'), 'success', 1500);
    } catch {
      setCode(null);
      setDeepLink(null);
      showToast(t('failed'), 'error', 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900">
      <section className="mx-auto max-w-lg space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm leading-6 text-neutral-600">{t('description')}</p>
        </header>
        <button
          type="button"
          onClick={generateCode}
          disabled={loading}
          className="h-11 rounded-xl bg-neutral-900 px-5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t('loading') : t('generate')}
        </button>
        {code && (
          <div className="space-y-3 rounded-xl bg-neutral-100 p-4">
            <p aria-live="polite" className="font-mono text-2xl tracking-[0.35em]">{code}</p>
            <p className="text-xs text-neutral-600">{t('expires')}</p>
            {deepLink ? (
              <a href={deepLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white">
                {t('openTelegram')}
              </a>
            ) : (
              <p className="text-xs text-neutral-600">{t('manualCode')}</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
