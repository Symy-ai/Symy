'use client';

/**
 * GrowthMilestoneOverlay — 小象成长阶段跃迁的全屏庆祝时刻 (batch5-b)
 *
 * 与既有两条庆祝路径的关系:
 * - stage-up-celebration (batch3-b): 卡内 3s 粒子动效, 每次升阶都放, 不持久化
 * - daily-ritual-overlay: 每日定时仪式 — 本组件是事件驱动 (跃迁才触发), 互不替代
 *
 * 跃迁检测: 高水位一次性。localStorage 存"已见证的最高阶段"
 * ('symy-growth-milestone-seen'), 只有当前阶段严格高于水位才庆祝一次并抬水位;
 * 降阶/回落绝不弹层也绝不降水位 (荣誉非羞辱, 同一跃迁一生只庆祝一次)。
 * 水位在弹层出现瞬间即写入 — 崩溃/秒退都不会导致重复弹。
 * 首次观测 (无存储记录) 只建基线不庆祝 — 不给存量进度补发 retroactive 庆典。
 *
 * 面子/里子: 弹层 app 内可见"这一程陪俺省下的钱" (里子, 仅自己可见提示);
 * 「晒一下」唤起 ShareModal 既有 streak 模板 — 分享导出面严格无金额 (share 域零改动)。
 * 全屏松绿视觉复用 c925e9a 的 #143527 色板与 globals.css 既有 stage-up-* keyframes。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import type { BuddyState, GrowthStage } from '@/types/buddy-state';
import { SymyAvatar } from './symy-avatar';
import { ShareModal } from '@/components/share/share-modal';

const STAGE_ORDER: GrowthStage[] = ['baby', 'young', 'adult', 'elder'];

// 4585277 同款零 DDL 持久化: 纯客户端 localStorage, 不建表
const SEEN_STORAGE_KEY = 'symy-growth-milestone-seen';

export function readSeenStage(): GrowthStage | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    return raw && (STAGE_ORDER as string[]).includes(raw) ? (raw as GrowthStage) : null;
  } catch {
    // safe to ignore: 隐私模式/quota 失败 → 视为无记录 (本次会话内内存水位兜底)
    return null;
  }
}

export function writeSeenStage(stage: GrowthStage): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, stage);
  } catch {
    // safe to ignore: 写失败时内存 prevStageRef 仍保证本会话只弹一次
  }
}

export interface StageTransition {
  /** 非空 = 本次应全屏庆祝的新阶段 */
  celebrate: GrowthStage | null;
  /** 观测后的新水位 — 只升不降 */
  nextSeen: GrowthStage;
}

/**
 * 跃迁判定 (纯函数, 供单测):
 * - seen=null: 首次观测 → 建基线, 不庆祝
 * - current 严格高于水位: 庆祝新阶段, 水位抬到 current
 * - 持平或低于水位 (含降阶): 不庆祝, 水位保持 (回落再升回同一阶段不重复庆祝)
 */
export function resolveStageTransition(seen: GrowthStage | null, current: GrowthStage): StageTransition {
  if (!seen || (STAGE_ORDER as string[]).includes(seen) === false) {
    return { celebrate: null, nextSeen: current };
  }
  if (STAGE_ORDER.indexOf(current) > STAGE_ORDER.indexOf(seen)) {
    return { celebrate: current, nextSeen: current };
  }
  return { celebrate: null, nextSeen: seen };
}

/** 两水位取高 (纯函数, 供单测) — null 视为最低 */
export function maxStage(a: GrowthStage | null, b: GrowthStage | null): GrowthStage | null {
  if (!a) return b;
  if (!b) return a;
  return STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}

// 12 颗粒子 — 确定性生成 (与 stage-up-celebration 同策略, 无随机数避免 SSR 差异)
const PARTICLE_COLORS = ['#4ADE80', '#34D399', '#2DD4BF', '#A7F3D0'];
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 - Math.PI / 2;
  const dist = 130 + (i % 3) * 42;
  return {
    tx: `${(Math.cos(angle) * dist).toFixed(1)}px`,
    ty: `${(Math.sin(angle) * dist * 0.72).toFixed(1)}px`,
    size: 4 + (i % 3) * 2,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: `${((i % 5) * 0.05).toFixed(2)}s`,
  };
});

interface GrowthMilestoneOverlayProps {
  buddyState: BuddyState;
  /** 数据加载中: buddyState 还是 fallback 值 (恒 baby), 必须跳过检测防止每次刷新假庆祝 */
  isLoading?: boolean;
}

export function GrowthMilestoneOverlay({ buddyState, isLoading = false }: GrowthMilestoneOverlayProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [celebration, setCelebration] = useState<GrowthStage | null>(null);
  const [fadingOut, setFadingOut] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const prevStageRef = useRef<GrowthStage | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 跃迁检测 — 同 hero-section vitality 通知的 isLoading 防抖策略:
  // 加载中重置内存水位, 首个真实观测与持久化水位对齐
  useEffect(() => {
    if (isLoading) {
      prevStageRef.current = null;
      return;
    }
    const current = buddyState.growthStage;
    // 对比基准取 内存prev 与 持久化水位 的较高者 — 降阶只降内存值不降水位,
    // 回落再升回同一阶段时仍被水位拦住 (同一跃迁一生只庆祝一次)
    const prev = maxStage(prevStageRef.current, readSeenStage());
    prevStageRef.current = current;
    const { celebrate, nextSeen } = resolveStageTransition(prev, current);
    // 出现瞬间即落盘标记 — "同一跃迁只庆祝一次" 不依赖用户点关闭
    writeSeenStage(nextSeen);
    if (celebrate) setCelebration(celebrate);
  }, [buddyState.growthStage, isLoading]);

  // 清理退场计时器
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setFadingOut(true);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setCelebration(null);
      setFadingOut(false);
    }, 400);
  }, []);

  // Escape 关闭 (ShareModal 打开时归它自己管)
  useEffect(() => {
    if (!celebration || shareOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [celebration, shareOpen, handleClose]);

  if (!celebration) return null;

  const stageName = t(`buddy.growthStage.${celebration}`, { defaultValue: celebration });
  const stageDesc = t(`buddy.growthStageDesc.${celebration}`, { defaultValue: '' });
  const savedStr = moneyToFreedomLabel(buddyState.totalSaved ?? 0, locale, hourlyRate);

  return (
    <>
      {createPortal(
        <div
          data-testid="growth-milestone-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('buddy.growth.milestone.ariaLabel', { defaultValue: 'Symy reached a new growth stage' })}
          className="fixed inset-0 z-[9999] overflow-hidden transition-opacity duration-400"
          onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; handleClose(); }}
          style={{
            background: 'radial-gradient(ellipse at 50% 28%, #1d4a35 0%, #143527 55%, #0c2017 100%)',
            opacity: fadingOut ? 0 : 1,
            pointerEvents: fadingOut ? 'none' : 'auto',
          }}
        >
          {/* 粒子 + 双 ring — 复用 globals.css 既有 stage-up-* keyframes */}
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-[38%] rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: p.color,
                boxShadow: `0 0 8px ${p.color}`,
                ['--tx' as string]: p.tx,
                ['--ty' as string]: p.ty,
                animation: `stage-up-particle 1.4s var(--ease-out-expo) ${p.delay} forwards`,
              }}
            />
          ))}

          <div className="relative w-full h-full max-w-md mx-auto flex flex-col items-center justify-center px-8 py-10 text-center">
            <p className="text-[11px] tracking-[0.35em] uppercase text-emerald-300/70">
              ✦ {t('buddy.growth.milestone.eyebrow', { defaultValue: 'Growth moment' })}
            </p>

            {/* 新阶段小象 — 双 ring 扩散 + 松绿光晕 */}
            <div className="relative my-7 flex items-center justify-center">
              <div
                className="absolute w-40 h-40 rounded-full border-2 border-emerald-400/70"
                style={{ animation: 'stage-up-ring 1.1s var(--ease-out-expo) forwards' }}
              />
              <div
                className="absolute w-40 h-40 rounded-full border border-teal-300/50"
                style={{ animation: 'stage-up-ring 1.4s var(--ease-out-expo) 0.25s forwards' }}
              />
              <div
                className="relative w-40 h-40 rounded-full bg-[#0c2017]/60 border border-emerald-400/30 shadow-2xl flex items-center justify-center"
                style={{ animation: 'stage-up-card-in 0.55s var(--ease-spring) 0.1s backwards' }}
              >
                <div className="w-28 h-28">
                  <SymyAvatar growthStage={celebration} animate className="w-full h-full" />
                </div>
              </div>
            </div>

            {/* 阶段称号 + 描述 (复用既有 growthStage key, 测试断言称号在此) */}
            <h2 className="text-2xl font-bold text-emerald-50" data-testid="growth-milestone-stage-title">
              {stageName}
            </h2>
            {stageDesc && stageDesc !== `buddy.growthStageDesc.${celebration}` && (
              <p className="text-xs text-emerald-200/70 mt-1.5 leading-relaxed max-w-xs">{stageDesc}</p>
            )}

            {/* 熊二式温度祝贺 */}
            <p className="text-base text-emerald-100/90 mt-5 leading-relaxed max-w-xs">
              {t('buddy.growth.milestone.blessing', {
                defaultValue: 'Every bit of this growth came from money you really kept. Thank you for growing with me.',
              })}
            </p>

            {/* 里子行 — app 内可见钱数, 带"仅自己可见"提示; 分享导出面永远不带 */}
            <div
              className="mt-5 px-4 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/25"
              data-testid="growth-milestone-saved"
            >
              <p className="text-sm text-emerald-300 font-semibold">
                {t('buddy.growth.milestone.savedLine', { amount: savedStr, defaultValue: `Along the way, you've won back {amount}` })}
              </p>
              <p className="text-[10px] text-emerald-200/60 mt-0.5 flex items-center justify-center gap-1">
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                {t('buddy.growth.milestone.privateHint', { defaultValue: 'Only you can see this' })}
              </p>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-xs">
              <button
                type="button"
                data-testid="growth-milestone-share"
                onClick={() => setShareOpen(true)}
                className="w-full py-3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 text-[#0c2017] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 hover:from-emerald-300 hover:to-teal-300 active:scale-95 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                {t('buddy.growth.milestone.shareEntry', { defaultValue: 'Share this moment' })}
              </button>
              <button
                type="button"
                data-testid="growth-milestone-close"
                onClick={handleClose}
                className="px-8 py-2.5 rounded-full border border-emerald-400/30 text-emerald-200/80 text-sm hover:bg-emerald-400/10 hover:text-emerald-100 transition-colors cursor-pointer"
              >
                {t('buddy.growth.milestone.continue', { defaultValue: 'Keep going together' })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 「晒一下」→ 既有 share 体系 streak 模板 (share 域零改动)。
          z-[10000]: 盖过本弹层 z-[9999]。medal.savedCents 沿用 badges-section 先例 —
          只喂 modal 内私密提示行与自由小时换算, 永不进分享导出图 */}
      {shareOpen && (
        <ShareModal
          open
          onClose={() => setShareOpen(false)}
          zIndexClass="z-[10000]"
          initialTemplate="streak"
          medal={{
            itemTitle: '',
            savedCents: Math.max(0, Math.round((buddyState.totalSaved ?? 0) * 100)),
            date: new Date().toISOString(),
          }}
          streakDays={buddyState.streak ?? 0}
          interceptCount={buddyState.challengesCompleted}
        />
      )}
    </>
  );
}
