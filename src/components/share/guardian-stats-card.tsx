'use client';

/**
 * GuardianStatsCard — 绿色守护战绩一图流分享卡 (batch24-c)
 *
 * 微信邀请链路的「晒战绩」出口: 等阶徽章 (六阶 guard-rank, 深绿金配色沿用
 * 拦截勋章定稿) + 三统计横排 (拦截次数 / 守护天数 / 赢回小时) + 小象品牌尾。
 * 数据全部由调用方 (invite-card 晒战绩入口) 从既有管道取好传入 — 卡本身零
 * fetch 零金额感知。
 *
 * 面子/里子铁律 (owner 09-06): 图上只有次数/天数/小时三项面子数据, 金额
 * (totalSaved) 永不进本组件 — 调用方只传已换算的 savedHours。
 *
 * 荣誉非羞耻: 零数据 (0 拦截且 0 守护天) 不出 0/0/0 空表, 出「第一次守护,
 * 从这张卡开始」正面引导态; 等阶名由调用方用既有 profile.guardRank.* 键解析。
 * 装饰全内联 SVG/lucide (无外部资源, html-to-image 导出无 CORS 风险);
 * stories 竖版 375x600, 同 milestone-card 尺寸族。
 */

import type { Ref } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatHoursNumber } from './card-templates';

export interface GuardianStatsCardProps {
  /** 等阶快照 — name 已由调用方按 profile.guardRank.* 解析, 纯荣誉字段无金额 */
  guardRank?: { name: string; level: number; emoji: string };
  /** 累计拦截次数 (/api/challenge/stats totalPassed) */
  interceptCount: number;
  /** 连续守护天数 (/api/buddy/state streak) */
  streakDays: number;
  /** 赢回的小时 (totalSaved 走 moneyToFreedomLabel 官方管线后传入, 卡上不出现金额) */
  savedHours?: number;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

/** 零数据判定: 无拦截且无守护天 → 引导态而非 0/0/0 空表 (导出供测试) */
export function isGuardianStatsEmpty(interceptCount: number, streakDays: number): boolean {
  return (Math.max(0, Math.floor(interceptCount) || 0)) === 0 && (Math.max(0, Math.floor(streakDays) || 0)) === 0;
}

/** 三统计格 — 数字 + 面子标签 (次/天/小时, 永无金额) */
function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 py-3.5 text-center" data-testid="guardian-stats-cell">
      <p className="text-[26px] font-black leading-none tracking-tight text-[#f0faf2]">{value}</p>
      <p className="mt-1.5 text-[10px] font-medium text-[#88a292]">{label}</p>
    </div>
  );
}

export function GuardianStatsCard({ guardRank, interceptCount, streakDays, savedHours, cardRef }: GuardianStatsCardProps) {
  const { t } = useI18n();
  const empty = isGuardianStatsEmpty(interceptCount, streakDays);
  // 注册表在 guardRank 缺失时不出本模板; 兜底新芽等阶保证组件独立可用
  const rank = guardRank ?? { name: t('profile.guardRank.sprout', { defaultValue: 'Sprout' }), level: 0, emoji: '🌱' };
  const hoursLabel = formatHoursNumber(savedHours ?? 0) || '0';

  return (
    <div
      ref={cardRef}
      data-testid="guardian-stats-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 (同族深绿视觉) */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 战绩标 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.guardianStats.title', { defaultValue: 'Guardian Record' })}
            </span>
          </div>
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
        </div>

        {/* 中部 — 正常态: 金色等阶徽章 + 三统计; 零数据态: 正面引导 (荣誉非羞耻) */}
        <div className="flex flex-1 flex-col justify-center">
          {empty ? (
            <div className="flex flex-col items-center py-6 text-center" data-testid="guardian-stats-empty">
              <span className="text-[44px] leading-none" aria-hidden="true">🌱</span>
              <p className="mt-4 text-[17px] font-bold text-[#f0faf2]">
                {t('share.guardianStats.empty.title', { defaultValue: 'Your first guard starts with this card' })}
              </p>
              <p className="mt-2 max-w-[250px] text-[12px] leading-relaxed text-[#88a292]">
                {t('share.guardianStats.empty.subtitle', { defaultValue: 'Pause your first impulse buy and this record begins to grow.' })}
              </p>
            </div>
          ) : (
            <>
              {/* 等阶徽章 — 金环 + emoji 大字 + 等阶名 (调用方按 profile.guardRank.* 解析) */}
              <div className="flex flex-col items-center" data-testid="guardian-stats-rank">
                <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-[#e8c268]/70">
                  <div
                    className="absolute inset-[-14px] rounded-full blur-[30px]"
                    style={{ background: 'rgba(232, 194, 104, 0.18)' }}
                    aria-hidden="true"
                  />
                  <span className="relative text-[52px] leading-none" aria-hidden="true">{rank.emoji}</span>
                </div>
                <p className="mt-4 text-[22px] font-bold leading-tight text-[#f0d68a]">{rank.name}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b8a15c]">
                  {t('profile.guardRank.levelPrefix', { defaultValue: 'Rank' })} L{rank.level}
                </p>
              </div>

              {/* 三统计横排 — 拦截次数 / 守护天数 / 赢回小时 (全面子, 无金额) */}
              <div className="mt-8 grid grid-cols-3 gap-2.5">
                <StatCell
                  value={String(Math.max(0, Math.floor(interceptCount) || 0))}
                  label={t('share.guardianStats.stats.intercepts', { defaultValue: 'Intercepts' })}
                />
                <StatCell
                  value={String(Math.max(0, Math.floor(streakDays) || 0))}
                  label={t('share.guardianStats.stats.days', { defaultValue: 'Days guarded' })}
                />
                <StatCell
                  value={hoursLabel}
                  label={t('share.guardianStats.stats.hours', { defaultValue: 'Hours won back' })}
                />
              </div>
            </>
          )}
        </div>

        {/* 底部品牌条 — 小象 + 生活方式尾 (brandTagline 复用既有键) */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-white">
            <span aria-hidden="true">🐘</span>
            Symy
          </span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
          </span>
        </div>
      </div>
    </div>
  );
}
