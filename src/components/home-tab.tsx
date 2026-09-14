'use client';

import { useState, useEffect, useRef } from 'react';
import { StatusText, AppStatus } from './status-indicator';
import { ImpulseEvent } from '@/lib/impulse-detector';
import { SpendingTrendChart } from './spending-trend-chart';
import { SpendingCapCard } from './spending-cap-card';
import { DailyGreenReport } from './daily-green-report';
import { TokenRow } from './profile-parts/token-row';
import { WeeklyGreenReport } from './weekly-green-report';
import { Shield, Eye, DollarSign, Flame } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useTheme } from 'next-themes';
import { createPortal } from 'react-dom';
// owner 铁律 (09-06): 除梦想基金外, 金额显示一律改为自由时间
import { moneyToFreedomLabel } from '@/lib/freedom-time';
// batch21-b: 主屏挑战入口 — 挑战管道第一次接上 home
import { WeeklyChallengeCard, type ActiveChallengeSnapshot } from './home/weekly-challenge-card';
import { pickWeeklyFeatureChallenge } from './buddy/challenge-definitions';
import { apiFetch } from '@/lib/api-client';
// guard-season: 守护季横幅 + 季挑战优先
import { getActiveGuardSeason } from '@/lib/guard-season';
import { GuardSeasonBanner } from './home/guard-season-banner';

interface HomeStats {
  totalEvents: number;
  impulseInterventions: number;
  moneySaved: number;
  daysStreak: number;
}

interface HomeTabProps {
  status: AppStatus;
  events: ImpulseEvent[];
  stats: HomeStats;
  onNavigateMonitor: () => void;
  onNavigateFamily: () => void;
  onNavigateChat: (context?: { type: 'challenge' | 'healing' | 'default'; message?: string }) => void;
  isLoading?: boolean;
  isDemo?: boolean;
}

export function HomeTab({ status, events, stats, onNavigateMonitor: _onNavigateMonitor, onNavigateFamily: _onNavigateFamily, onNavigateChat: _onNavigateChat, isLoading, isDemo = false }: HomeTabProps) {
  const { t, locale } = useI18n();
  const { resolvedTheme } = useTheme();
  const elephantSrc = resolvedTheme === 'dark' ? '/symy-elephant-dark.png' : '/symy-elephant.png';

  // 需求三: 同时只显示一个 tooltip
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // batch21-b: 本周守护挑战 — 确定性周轮换 (同一周全端同一条) + /api/challenge/active 只读拉取
  // 三态: undefined=加载中/失败 (整卡静默隐藏) / null=无进行中 (CTA 态) / 有值=进行中 (里子行)
  const weeklyChallenge = pickWeeklyFeatureChallenge();
  const season = getActiveGuardSeason(new Date(), locale);
  const effectiveWeeklyChallenge = season?.challenge ?? weeklyChallenge;
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallengeSnapshot | null | undefined>(undefined);

  useEffect(() => {
    if (isDemo) {
      // demo 无挑战管道后端 — 直接给 CTA 态 (page 层 demo 导航原生支持 challenge 类型)
      setActiveChallenge(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ challenge?: { id: string; item_name: string; amount: number } }>('/api/challenge/active')
      .then((data) => { if (!cancelled) setActiveChallenge(data?.challenge ?? null); })
      .catch(() => { if (!cancelled) setActiveChallenge(undefined); });
    return () => { cancelled = true; };
  }, [isDemo]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar">
        <div className="flex flex-col items-center pt-4 pb-2">
          {/* 🔧 Logo fix: skeleton 也改为方形 (与实际 logo 一致, 不再用 rounded-full) */}
          <div className="w-20 h-20 bg-glass-fill animate-pulse" />
          <div className="w-32 h-4 bg-glass-fill rounded mt-3 animate-pulse" />
          <div className="w-48 h-3 bg-glass-fill rounded mt-2 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="glass-card rounded-xl p-3.5 animate-pulse">
              <div className="w-8 h-8 bg-glass-fill rounded-lg mb-2" />
              <div className="w-12 h-5 bg-glass-fill rounded mb-1" />
              <div className="w-16 h-3 bg-glass-fill rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar">
      {/* Hero — Companion + Status */}
      <div className="text-center space-y-3">
        {/* 🔧 Logo fix: 恢复与登录页一致的样式 (无圆形 frame, 保持原始宽高比, dark mode 白色外发光)
            旧代码: w-16 h-16 rounded-full overflow-hidden object-cover → 强制方形+圆形裁剪
            新代码: w-20 h-auto + drop-shadow filter → 与 src/app/auth/login/page.tsx:176-178 一致 */}
        <div className="relative w-20 h-auto mx-auto">
          <img
            src={elephantSrc}
            alt="Symy"
            className={`relative w-full h-auto mx-auto ${resolvedTheme === 'dark' ? '[filter:drop-shadow(0_0_4px_rgba(255,255,255,0.9))_drop-shadow(0_0_8px_rgba(255,255,255,0.6))_drop-shadow(0_0_16px_rgba(255,255,255,0.3))]' : ''}`}
          />
        </div>
        <StatusText status={status} count={stats.impulseInterventions} />
        <p className="text-xs text-text-tertiary max-w-[280px] mx-auto leading-relaxed">
          {isDemo ? t('home.taglineDemo') : t('home.tagline')}
        </p>
      </div>

      {/* Stats Grid — Glass Cards with Neon Accents */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Eye className="w-4 h-4" />}
          label={t('home.eventsDetected')}
          hint={t('home.eventsDetectedHint', { defaultValue: 'What moved you, and what you saw' })}
          tooltipKey="eventsDetected"
          tooltipTitle={t('home.eventsDetected')}
          tooltipContent={t('home.eventsDetectedDetail', { defaultValue: 'Includes:\n• Email receipts detected (after connecting email)\n• Challenges you started\n\nDoes not include:\n• Browsing products (we don\'t track browsing)\n• Adding to cart (we don\'t track carts)' })}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          value={stats.totalEvents.toString()}
          gradient="from-blue-500/20 to-cyan-500/10"
          iconBg="bg-blue-500/15"
          iconColor="text-blue-400"
          neonBorder="border-blue-500/15"
        />
        <StatCard
          icon={<Shield className="w-4 h-4" />}
          label={t('home.interventions')}
          hint={t('home.interventionsHint', { defaultValue: 'What you saw + what you reclaimed' })}
          tooltipKey="interventions"
          tooltipTitle={t('home.interventions')}
          tooltipContent={t('home.interventionsDetail', { defaultValue: 'Includes:\n• Challenges where you saw the truth\n• Refunds you reclaimed\n\nDoes not include:\n• Challenges you closed midway\n• Chat without challenge' })}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          value={stats.impulseInterventions.toString()}
          gradient="from-red-500/20 to-pink-500/10"
          iconBg="bg-red-500/15"
          iconColor="text-red-400"
          neonBorder="border-red-500/15"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label={t('home.moneySaved')}
          tooltipKey="moneySaved"
          tooltipTitle={t('home.moneySaved')}
          tooltipContent={t('home.moneySavedDetail', { defaultValue: 'This is the amount you "saved" through challenges — money you considered spending but didn\'t.\n\n⚠️ This is virtual bookkeeping, not real savings. The money is still in your bank account.\n\nConnect Dream Funds to track real savings progress.' })}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          value={moneyToFreedomLabel(stats.moneySaved, locale)}
          gradient="from-green-500/20 to-emerald-500/10"
          iconBg="bg-green-500/15"
          iconColor="text-green-400"
          neonBorder="border-green-500/15"
          // 需求三: Money Saved 下方加 "虚拟记账" 小字
          subtitle={t('home.moneySavedVirtualNote', { defaultValue: 'Virtual bookkeeping, not real savings' })}
        />
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label={t('home.dayStreak')}
          tooltipKey="dayStreak"
          tooltipTitle={t('home.dayStreak')}
          tooltipContent={t('home.dayStreakDetail', { defaultValue: 'Consecutive days using Symy. Complete at least 1 challenge or chat per day to maintain. 24h inactivity resets to 0.' })}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          value={`${stats.daysStreak} ${t('common.days')}`}
          gradient="from-orange-500/20 to-amber-500/10"
          iconBg="bg-orange-500/15"
          iconColor="text-orange-400"
          neonBorder="border-orange-500/15"
        />
      </div>

      {/* owner 09-06: 代币行从 buddy 页迁至此 (总览详情页, 日报上方) */}
      <TokenRow />

      {/* 每日绿色守护日报 — 面子(守护/连续)可分享, 里子(金额/小时)仅 app 内可见 */}
      <DailyGreenReport events={events} stats={stats} isDemo={isDemo} />

      {/* batch21-b: 本周守护挑战 — 挑战入口第一次上主屏 (DailyGreenReport 之后, 第一可视区末尾, 不抢数字卡头位)
          面子: 周轮换荣誉任务; 里子: 挑战管道 active.amount + 官方自由时间换算 */}
      {/* 守护季横幅 (季叙事 + 季挑战是一个整体单元, 位于挑战卡正上方) */}
      {season && <GuardSeasonBanner season={season} isDemo={isDemo} />}
      <WeeklyChallengeCard
        weekly={effectiveWeeklyChallenge}
        active={activeChallenge}
        onStart={(challenge) => _onNavigateChat(
          activeChallenge
            ? { type: 'challenge' } // 进行中: 只导航, chat 侧自恢复 active 挑战 (page 层 message=undefined 时不发消息)
            : { type: 'challenge', message: t(challenge.titleKey) }, // CTA: 带本周挑战名进 chat
        )}
      />

      {/* 守护者周报 — 近 7 天 ≥3 守护天才出现 (组件内自门控), 里子金额在次级区, 不进任何分享管道 */}
      <WeeklyGreenReport events={events} />

      {/* 7 天消费趋势图 */}
      <SpendingCapCard />
      <SpendingTrendChart events={events} moneySaved={stats.moneySaved} />
      {/* 🔧 PM fix (2026-07-18): 删除 Quick Actions (查看订单/开始疗愈) — 功能未完善 */}
      {/* Recent Impulse Events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-secondary">{t('home.recentImpulseEvents')}</h3>
        </div>
        <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
          {/* 🔧 PM-NEW-78 fix: 显示更多记录 (20 而非 5/10) */}
          {events.slice(0, 20).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
          {events.length === 0 && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500/15 to-purple-500/15 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-7 h-7 text-cyan-400" />
              </div>
              <p className="text-text-secondary text-sm font-medium">{t('home.noImpulseEvents')}</p>
              <p className="text-text-tertiary text-xs mt-1">{t('home.shoppingUnderControl')}</p>
              <p className="text-text-tertiary text-[10px] mt-2 max-w-[220px] mx-auto">
                {t('home.connectEmailHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 需求三: StatCard with clickable ⓘ tooltip
function StatCard({
  icon,
  label,
  hint,
  tooltipKey,
  tooltipTitle,
  tooltipContent,
  activeTooltip,
  setActiveTooltip,
  value,
  gradient,
  iconBg,
  iconColor,
  neonBorder,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  tooltipKey?: string;
  tooltipTitle?: string;
  tooltipContent?: string;
  activeTooltip: string | null;
  setActiveTooltip: (key: string | null) => void;
  value: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
  neonBorder: string;
  subtitle?: string;
}) {
  const { t } = useI18n();
  const isOpen = tooltipKey && activeTooltip === tooltipKey;
  const cardRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveTooltip(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, setActiveTooltip]);

  return (
    <div
      ref={cardRef}
      className={`glass-card rounded-xl p-3.5 bg-gradient-to-br ${gradient} ${neonBorder} relative`}
    >
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${iconBg} ${iconColor} mb-2`}>
        {icon}
      </div>
      <div className="flex items-center gap-1">
        <p className="text-lg font-bold text-text-primary">{value}</p>
        {/* 需求三: ⓘ 改为可点击 button */}
        {tooltipKey && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(isOpen ? null : tooltipKey);
            }}
            className="w-4 h-4 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary hover:bg-glass-fill-strong transition-colors flex items-center justify-center text-[9px] cursor-pointer"
            aria-label="Info"
          >
            ⓘ
          </button>
        )}
      </div>
      <p className="text-[11px] text-text-secondary">{label}</p>
      {/* 需求三: Money Saved 下方加 "虚拟记账" 小字 */}
      {subtitle && (
        <p className="text-[9px] text-text-tertiary/60 mt-0.5 leading-tight">{subtitle}</p>
      )}
      {/* 🔧 BUG-339 fix: hint 解释每个 stat 的计算口径 */}
      {hint && !subtitle && (
        <p className="text-[9px] text-text-tertiary/70 mt-0.5 leading-tight">{hint}</p>
      )}

      {/* 需求三: Tooltip 弹窗 */}
      {isOpen && tooltipContent && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={() => setActiveTooltip(null)}
        >
          <div
            className="relative w-[calc(100%-32px)] max-w-[320px] bg-surface-2 border border-glass-border rounded-xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <span className="text-[12px]">ⓘ</span>
                {tooltipTitle}
              </h4>
              <button
                onClick={() => setActiveTooltip(null)}
                className="w-6 h-6 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center text-xs"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {/* 分隔线 */}
            <div className="border-t border-glass-border mb-3" />
            {/* 内容 */}
            <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
              {tooltipContent}
            </div>
            {/* 了解按钮 */}
            <button
              onClick={() => setActiveTooltip(null)}
              className="w-full mt-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors cursor-pointer"
            >
              {t('common.gotIt', { defaultValue: 'Got it' })}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function EventRow({ event }: { event: ImpulseEvent }) {
  const { t, locale } = useI18n();
  const timeAgo = getTimeAgo(event.timestamp, t);
  const scoreColor =
    event.impulseScore > 60 ? 'text-red-600 dark:text-red-400' : event.impulseScore > 30 ? 'text-yellow-600 dark:text-yellow-400' : 'text-cyan-600 dark:text-cyan-400';

  const isChallenge = event.platform === 'challenge' || event.category === 'challenge';
  const subType = event.subType || (isChallenge ? 'challenge_completed' : 'impulse_purchase');
  // 🔧 镜子哲学: 没有"失败"概念 — 用户只是"没看见"
  // challenge_failed → 用 "未看见" 图标 (👁️‍🗨️ 而非 💔), 颜色用中性灰而非红色
  const iconMap: Record<string, { icon: string; gradient: string }> = {
    impulse_purchase: { icon: '🛒', gradient: 'from-pink-500/15 to-purple-500/15' },
    refund_processed: { icon: '💰', gradient: 'from-green-500/15 to-emerald-500/15' },
    challenge_completed: { icon: '🛡️', gradient: 'from-cyan-500/15 to-blue-500/15' },
    challenge_failed: { icon: '🌫️', gradient: 'from-gray-500/15 to-slate-500/15' },
    healing_kit: { icon: '💊', gradient: 'from-amber-500/15 to-yellow-500/15' },
  };
  const { icon, gradient } = iconMap[subType] || iconMap.impulse_purchase;

  const amountPrefix = subType === 'refund_processed' || subType === 'challenge_completed' ? '+' : '-';
  // 🔧 镜子哲学: challenge_failed 不用红色 (评判), 用中性灰
  const amountColor = subType === 'refund_processed' ? 'text-emerald-400'
    : subType === 'challenge_completed' ? 'text-cyan-400'
    : subType === 'challenge_failed' ? 'text-text-tertiary'
    : 'text-red-400';

  return (
    <div className="flex items-center gap-3 p-3 glass-card rounded-xl">
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center text-sm`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {(event.item || t('common.unknown')).length > 60 ? (event.item || t('common.unknown')).substring(0, 60) + '...' : (event.item || t('common.unknown'))}
        </p>
        <p className="text-xs text-text-tertiary">
          <span className={amountColor}>{amountPrefix}{moneyToFreedomLabel(event.amount || 0, locale)}</span> · {timeAgo}
        </p>
      </div>
      {subType === 'impulse_purchase' && (
        <div className={`text-sm font-bold ${scoreColor}`}>{event.impulseScore}</div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date, t: (key: string, values?: Record<string, string | number>) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (isNaN(diffMs) || diffMs < 0) return t('common.justNow');
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return t('common.justNow');
  if (diffMins < 60) return t('common.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('common.hoursAgo', { n: diffHours });
  return t('common.daysAgo', { n: diffDays });
}
