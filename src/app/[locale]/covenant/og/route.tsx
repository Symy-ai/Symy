import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const size = { width: 1200, height: 630 } as const;
const fontFamily = 'Helvetica, Arial, PingFang SC, sans-serif';

const copy = {
  en: {
    title: '新契约',
    hours: 'Won back together',
  },
  zh: {
    title: '新契约',
    hours: 'Won back together',
  },
} as const;

function getCopy(locale: string | undefined) {
  return locale === 'zh' ? copy.zh : copy.en;
}

function formatHours(value: number) {
  const hours = Math.max(0, value);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  const display = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    maximumSignificantDigits: Math.max(1, Math.round(hours).toString().length),
  }).format(hours);
  return `${display} hours`;
}

export function buildCovenantOgContent(
  locale: string | undefined,
  collective: { hours: number } | null,
) {
  const content = getCopy(locale);
  return (
    <div
      style={{
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0c2017 0%, #143527 50%, #0c2017 100%)',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily,
        height: '100%',
        justifyContent: 'space-between',
        padding: '64px 84px',
        width: '100%',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', fontSize: 48, fontWeight: 800 }}>
        <span style={{ marginRight: 16 }}>🐘</span>
        <span
          style={{
            background: 'linear-gradient(90deg, #4ADE80, #14B8A6)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Symy
        </span>
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>{content.title}</div>
        {collective ? (
          <>
            <div style={{ color: '#4ADE80', fontSize: 76, fontWeight: 800, lineHeight: 1 }}>
              {formatHours(collective.hours)}
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, opacity: 0.84 }}>{content.hours}</div>
          </>
        ) : null}
      </div>
      <div />
    </div>
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale } = await context.params;
  let collective: { hours: number } | null = null;
  try {
    const snapshot = await loadTransparencyWeekly();
    collective = { hours: snapshot.hoursWon.total };
  } catch {
    // A data outage should not turn a share card into a 500.
  }

  return new ImageResponse(buildCovenantOgContent(locale, collective), size);
}
