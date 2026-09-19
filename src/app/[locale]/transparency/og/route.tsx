/**
 * GET /[locale]/transparency/og — 每周透明度报告分享卡 (batch82-a)
 *
 * BP 0918 p20: 公开即内容，内容即获客 — X.com 是种子平台，每周数据都要能变成
 * 一张可晒的图。复用 /[locale]/og 的 ImageResponse 先例 (同尺寸/同品牌底/同
 * locale copy 对象模式)。
 *
 * 数据层: 与页面共用 loadTransparencyWeekly (服务端直调，不自我 fetch)。
 * 降级红线: loader 任何失败 → 静态骨架卡 (品牌 + 内容引擎 slogan)，恒 200 不抛 500。
 *
 * 红线: 四指标全部是平台聚合 (我们自己的账)，结构上无用户级字段；
 * 无 FOMO 话术 — 守护叙事平静呈现。
 */

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OgSize = { width: 1200; height: 630 };

const size: OgSize = { width: 1200, height: 630 };
const fontFamily = 'Helvetica, Arial, PingFang SC, sans-serif';

const copy = {
  en: {
    weekOf: (date: string) => `Week of ${date}`,
    engine: 'Transparency is our content engine',
    stats: ['Intercepts', 'Saved for users', 'Hours won back', 'Guardians (all time)'],
  },
  zh: {
    weekOf: (date: string) => `周报 · ${date} 起`,
    engine: '透明就是我们的内容引擎',
    stats: ['拦截次数', '为用户省下', '赢回小时', '守护者（累计）'],
  },
} as const;

function getCopy(locale: string | undefined) {
  return locale === 'zh' ? copy.zh : copy.en;
}

function formatInt(value: number) {
  return `${Math.max(0, Math.round(value))}`;
}

function formatHours(value: number) {
  const hours = Math.max(0, value);
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
    justifyContent: 'space-between',
    padding: '56px 84px',
    width: '100%',
  } as const;
}

function brandRow(locale: string | undefined, weekDate: string | null) {
  const content = getCopy(locale);
  return (
    <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
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
      {weekDate && (
        <div style={{ fontSize: 32, fontWeight: 700, opacity: 0.85 }}>
          {content.weekOf(weekDate)}
        </div>
      )}
    </div>
  );
}

function metricTiles(snapshot: TransparencySnapshot, locale: string | undefined) {
  const labels = getCopy(locale).stats;
  const values = [
    formatInt(snapshot.intercepts.week),
    `$${formatInt(snapshot.savedUsd.week)}`,
    formatHours(snapshot.hoursWon.week),
    formatInt(snapshot.guards),
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', width: '100%' }}>
      {labels.map((label, index) => (
        <div
          key={label}
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(20, 53, 39, 0.75)',
            borderColor: '#4ADE80',
            borderRadius: 28,
            borderStyle: 'solid',
            borderWidth: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 168,
            justifyContent: 'center',
            width: 500,
          }}
        >
          <div style={{ color: '#4ADE80', fontSize: 60, fontWeight: 800, lineHeight: 1 }}>
            {values[index]}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 16, opacity: 0.82 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function weeklyCard(locale: string | undefined, snapshot: TransparencySnapshot) {
  const content = getCopy(locale);
  return (
    <div style={cardStyle()}>
      {brandRow(locale, snapshot.weekStart.slice(0, 10))}
      {metricTiles(snapshot, locale)}
      <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.9 }}>
        {content.engine}
      </div>
    </div>
  );
}

/** 静态骨架卡 — 数据取不到时的降级面，品牌 + 内容引擎 slogan，不携带任何指标 */
function fallbackCard(locale: string | undefined) {
  const content = getCopy(locale);
  return (
    <div style={{ ...cardStyle(), justifyContent: 'center' }}>
      {brandRow(locale, null)}
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 40,
        }}
      >
        <div
          style={{
            background: 'linear-gradient(90deg, #4ADE80, #14B8A6)',
            backgroundClip: 'text',
            color: 'transparent',
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          Symy
        </div>
        <div style={{ fontSize: 52, fontWeight: 700 }}>{content.engine}</div>
      </div>
      <div />
    </div>
  );
}

export function buildTransparencyOgContent(
  locale: string | undefined,
  snapshot: TransparencySnapshot | null
) {
  return snapshot ? weeklyCard(locale, snapshot) : fallbackCard(locale);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> }
) {
  const { locale } = await context.params;

  // loadTransparencyWeekly 自带降级阶梯 (恒 200)；这里再兜一层模块级意外 —
  // 任何取数失败都只影响卡片内容，绝不向公开端点抛 500
  let snapshot: TransparencySnapshot | null = null;
  try {
    snapshot = await loadTransparencyWeekly();
  } catch {
    snapshot = null;
  }

  return new ImageResponse(buildTransparencyOgContent(locale, snapshot), size);
}
