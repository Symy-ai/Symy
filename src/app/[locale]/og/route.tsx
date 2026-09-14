import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

type OgSize = { width: 1200; height: 630 };
type PublicInviteStats = {
  found: boolean;
  displayName?: string | null;
  intercepts?: number;
  guardDays?: number;
  freedomHours?: number;
};

const size: OgSize = { width: 1200, height: 630 };
const fontFamily = 'Helvetica, Arial, PingFang SC, sans-serif';

const copy = {
  en: {
    slogan: 'Buy less. Live more.',
    companion: 'Your AI green-shopping companion. Every guarded choice is a medal.',
    statTitle: 'A real guardian record',
    stats: ['Intercepts', 'Days guarded', 'Hours won back'],
  },
  zh: {
    slogan: '少买一点，多活一点。',
    companion: 'AI 绿色消费助手，在每一次购买前替你守住绿色关。',
    statTitle: '一份真实的守护战绩',
    stats: ['拦截次数', '守护天数', '赢回小时'],
  },
} as const;

function getCopy(locale: string | undefined) {
  return locale === 'zh' ? copy.zh : copy.en;
}

function safeName(displayName: string | null | undefined) {
  return (displayName ?? '').trim().slice(0, 24) || 'Symy';
}

function formatNumber(value: number | undefined) {
  return `${Math.max(0, value ?? 0)}`;
}

function formatHours(value: number | undefined) {
  const hours = Math.max(0, value ?? 0);
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

function cardStyle() {
  return {
    alignItems: 'center',
    background:
      'linear-gradient(135deg, #0c2017 0%, #143527 50%, #0c2017 100%)',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily,
    height: '100%',
    justifyContent: 'center',
    padding: 80,
    width: '100%',
  } as const;
}

function brandCard(locale: string | undefined) {
  const content = getCopy(locale);
  return (
    <div style={cardStyle()}>
      <div
        style={{
          alignItems: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '2px solid rgba(255,255,255,0.2)',
          borderRadius: 9999,
          display: 'flex',
          fontSize: 96,
          height: 160,
          justifyContent: 'center',
          marginBottom: 48,
          width: 160,
        }}
      >
        🐘
      </div>
      <div
        style={{
          background: 'linear-gradient(90deg, #4ADE80, #14B8A6)',
          backgroundClip: 'text',
          color: 'transparent',
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -2,
          marginBottom: 24,
        }}
      >
        Symy
      </div>
      <div style={{ fontSize: 64, fontWeight: 700, marginBottom: 40 }}>
        {content.slogan}
      </div>
      <div
        style={{
          fontSize: 36,
          lineHeight: 1.4,
          maxWidth: 1000,
          opacity: 0.9,
          textAlign: 'center',
        }}
      >
        {content.companion}
      </div>
    </div>
  );
}

function statTiles(stats: PublicInviteStats) {
  return [
    { value: formatNumber(stats.intercepts), label: 'intercepts' },
    { value: formatNumber(stats.guardDays), label: 'guardDays' },
    { value: formatHours(stats.freedomHours), label: 'freedomHours' },
  ];
}

function statsCard(locale: string | undefined, stats: PublicInviteStats) {
  const content = getCopy(locale);
  const values = statTiles(stats);
  return (
    <div style={{ ...cardStyle(), justifyContent: 'space-between', padding: '72px 84px' }}>
      <div
        style={{
          alignItems: 'center',
          color: '#fbbf24',
          display: 'flex',
          fontSize: 54,
          fontWeight: 800,
        }}
      >
        {safeName(stats.displayName)}
        <span style={{ fontSize: 44, marginLeft: 20 }}>🐘</span>
      </div>
      <div>
        <div style={{ color: '#fbbf24', fontSize: 48, fontWeight: 800 }}>
          {content.statTitle}
        </div>
        <div
          style={{
            alignItems: 'stretch',
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 36,
          }}
        >
          {values.map((stat, index) => (
            <div
              key={stat.label}
              style={{
                alignItems: 'center',
                backgroundColor: 'rgba(20, 53, 39, 0.75)',
                borderColor: '#fbbf24',
                borderRadius: 32,
                borderStyle: 'solid',
                borderWidth: 2,
                display: 'flex',
                flexDirection: 'column',
                height: 212,
                justifyContent: 'center',
                padding: '24px 34px',
                width: 302,
              }}
            >
              <div
                style={{
                  color: '#fbbf24',
                  fontSize: 58,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: 24,
                  fontWeight: 600,
                  marginTop: 18,
                }}
              >
                {content.stats[index]}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.9 }}>
        {content.slogan}
      </div>
    </div>
  );
}

export function buildOgContent(
  locale: string | undefined,
  stats: PublicInviteStats | null
) {
  return stats?.found ? statsCard(locale, stats) : brandCard(locale);
}

async function fetchPublicStats(origin: string, refCode: string) {
  const statsUrl = new URL('/api/invite/public-stats', origin);
  statsUrl.searchParams.set('ref', refCode);
  try {
    const response = await globalThis.fetch(statsUrl, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicInviteStats;
  } catch {
    // safe to ignore: any public-stats failure intentionally renders the brand card.
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> }
) {
  const [{ locale }, refCode] = await Promise.all([
    context.params,
    Promise.resolve(request.nextUrl.searchParams.get('ref')?.trim()),
  ]);
  const stats = refCode
    ? await fetchPublicStats(request.nextUrl.origin, refCode)
    : null;

  return new ImageResponse(buildOgContent(locale, stats), size);
}
