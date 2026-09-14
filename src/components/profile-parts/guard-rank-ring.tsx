'use client';

import { type GuardRank } from '@/lib/guard-rank';
import { useI18n } from '@/i18n/provider';

export interface RankRingChannel {
  channel: 'intercepts' | 'streakDays' | 'badges';
  pct: number;
}

interface GuardRankRingProps {
  rank: GuardRank;
  channels: RankRingChannel[];
  bestChannel?: RankRingChannel['channel'];
}

const RADII = [72, 57, 42] as const;
const STROKE = 9;
const CX = 100;
const CY = 100;
const CIRC = 2 * Math.PI;
const TWO_PI = CIRC;

function circumference(r: number) {
  return TWO_PI * r;
}

function labelPosition(r: number, pct: number) {
  const angle = (-90 + pct * 360) * (Math.PI / 180);
  const offset = r + STROKE / 2 + 5;
  return {
    x: CX + offset * Math.cos(angle),
    y: CY + offset * Math.sin(angle),
  };
}

export function GuardRankRing({ rank, channels, bestChannel }: GuardRankRingProps) {
  const { t } = useI18n();
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        className="h-[180px] w-[180px] -rotate-90"
        aria-hidden="true"
      >
        {channels.map((ch, idx) => {
          const r = RADII[idx];
          const c = circumference(r);
          const isBest = bestChannel === ch.channel;
          const showLabel = ch.pct > 0.01 && ch.pct < 0.99;

          return (
            <g key={ch.channel}>
              {/* background track */}
              <circle
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={STROKE}
              />
              {/* progress arc */}
              <circle
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke={isBest ? '#4ade80' : 'rgba(255,255,255,0.15)'}
                strokeWidth={STROKE}
                strokeDasharray={c}
                strokeDashoffset={c * (1 - ch.pct)}
                className="transition-all duration-500"
                strokeLinecap="round"
              />
              {/* percentage label */}
              {showLabel && (
                <text
                  x={labelPosition(r, ch.pct).x}
                  y={labelPosition(r, ch.pct).y}
                  transform={`rotate(90 ${labelPosition(r, ch.pct).x} ${labelPosition(r, ch.pct).y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-[#f0faf2] text-[10px] font-semibold"
                  style={{ fontSize: '10px' }}
                >
                  {Math.round(ch.pct * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* center rank info */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[80px] leading-none">{rank.emoji}</span>
        <span className="mt-1 text-[11px] font-semibold text-[#f0faf2]">{t(rank.nameKey)}</span>
      </div>
    </div>
  );
}
