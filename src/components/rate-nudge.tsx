'use client';

/**
 * RateNudge — 时薪个性化引导胶囊 (batch26-b)
 *
 * 动机: 默认时薪下「赢回 X 小时」是通用演示值 — 时薪 100 的用户攒下一周本该
 * 看到「赢回 15 小时」却显示 3 小时。荣誉时刻引导设一次时薪, 战报/分享卡上的
 * 小时数从此真正属于用户 (单例共享态, 全部换算点同步生效)。
 *
 * 形态铁律: 轻量胶囊 — 非弹窗、不阻断、不打断阅读; 点开内联展开输入框,
 * 保存成功即淡出; 可「暂不」且 localStorage 永不复发。
 * 口吻铁律 (荣誉框架): 是「为你定制」, 不是「你没设置」— 不说数字不准/假。
 *
 * 触发条件 (全部满足才渲染):
 * - rateIsDefault === true (用户从未设置, 服务端 DB null)
 * - hasStats (挂载点传入, 用户已有非零战绩 — 数字开始有意义才值得定制)
 * - 已登录 (未登录设时薪无从保存; demo 场景自然隐藏)
 * - 未显式关闭 (localStorage 'symy-rate-nudge-dismissed')
 *
 * 校验与保存照抄 profile 设置路径的规则 (1 ≤ rate ≤ 1,000,000), 复用
 * useHourlyRate().setHourlyRate — 胶囊是第二入口, 不替代 profile 设置件。
 * 校验错误文案复用 profile.hourlyRate* 既有 key (同规则同文案, 双语齐全)。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useAuth } from '@/components/auth/auth-provider';
import { logger } from '@/lib/logger';

/** localStorage 关闭标记 — 命名沿项目 symy-kebab 惯例; 关闭后跨会话不复发 */
const DISMISS_KEY = 'symy-rate-nudge-dismissed';

/** 与 profile 设置路径一致的时薪上限 */
const MAX_HOURLY_RATE = 1_000_000;

/** 保存成功后「已为你定制」停留时长, 之后开始淡出 */
const SUCCESS_HOLD_MS = 1200;

/** 淡出动画时长, 之后彻底移除 */
const FADE_MS = 700;

export interface RateNudgeProps {
  /** 用户已有非零战绩 (由挂载点传入, 组件内不拉数据) */
  hasStats: boolean;
}

export function RateNudge({ hasStats }: RateNudgeProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { rateIsDefault, setHourlyRate } = useHourlyRate();

  const [dismissChecked, setDismissChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
  }, []);

  // localStorage 只在客户端可读 — mount 后再查, SSR/首帧不渲染胶囊
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
    } catch {
      // 隐私模式等 localStorage 不可用: 视为未关闭, 胶囊照常出现 (可再次关闭)
    }
    setDismissChecked(true);
    return clearFadeTimer;
  }, [clearFadeTimer]);

  const dismiss = useCallback(() => {
    clearFadeTimer();
    setDismissed(true);
    setExpanded(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // safe to ignore: 隐私模式写不进 localStorage — 降级为仅本次会话内消失, 不阻塞引导
      logger.warn('[RateNudge] Failed to persist dismiss flag');
    }
  }, [clearFadeTimer]);

  const handleSave = useCallback(async () => {
    const rate = parseFloat(input);
    // 校验: 1 ≤ rate ≤ MAX_HOURLY_RATE (与 hourly-rate API 一致)
    if (isNaN(rate) || rate <= 0) {
      setErrorKey('profile.hourlyRateInvalid');
      return;
    }
    if (rate < 1) {
      setErrorKey('profile.hourlyRateTooLow');
      return;
    }
    if (rate > MAX_HOURLY_RATE) {
      setErrorKey('profile.hourlyRateTooHigh');
      return;
    }
    setErrorKey(null);
    setSaving(true);
    try {
      await setHourlyRate(rate);
      // 成功 → 「已为你定制」短暂停留, 然后淡出让位给战报本体
      // (rateIsDefault 已被单例置 false, 其他挂载点的胶囊同步消失)
      setSaving(false);
      setSaved(true);
      fadeTimer.current = setTimeout(() => {
        setFading(true);
        fadeTimer.current = setTimeout(() => setDismissed(true), FADE_MS);
      }, SUCCESS_HOLD_MS);
    } catch {
      // 保存失败: 保持展开 + 提示, 用户可重试或暂不 (不静默吞掉输入)
      setSaving(false);
      setErrorKey('profile.hourlyRateSaveFailed');
    }
  }, [input, setHourlyRate]);

  if (!user || !hasStats || !rateIsDefault || dismissed || !dismissChecked) {
    return null;
  }

  if (!expanded) {
    return (
      <div
        data-testid="rate-nudge"
        className="relative z-10 mt-3 flex items-center justify-between gap-2 rounded-full border border-emerald-300/25 bg-white/5 py-1.5 pl-3 pr-1.5"
      >
        <button
          type="button"
          data-testid="rate-nudge-open"
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-emerald-200/90 transition-colors hover:text-emerald-100"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
          <span className="truncate">{t('rateNudge.cta')}</span>
        </button>
        <button
          type="button"
          data-testid="rate-nudge-dismiss"
          onClick={dismiss}
          aria-label={t('rateNudge.notNow')}
          className="shrink-0 rounded-full p-1 text-[#88a292] transition-colors hover:text-emerald-200"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="rate-nudge"
      className={`relative z-10 mt-3 rounded-xl border border-emerald-300/25 bg-white/5 p-3 transition-opacity duration-700 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {saved ? (
        <p
          data-testid="rate-nudge-success"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200"
        >
          <Sparkles className="h-3 w-3 text-emerald-300" aria-hidden="true" />
          {t('rateNudge.success')}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={MAX_HOURLY_RATE}
              step="any"
              data-testid="rate-nudge-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (errorKey) setErrorKey(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder={t('rateNudge.inputPlaceholder')}
              aria-label={t('rateNudge.inputPlaceholder')}
              className="min-w-0 flex-1 rounded-lg border border-emerald-300/25 bg-black/20 px-2.5 py-1.5 text-xs text-[#f0faf2] placeholder:text-[#5f7a6b] focus:border-emerald-300/50 focus:outline-none"
            />
            <button
              type="button"
              data-testid="rate-nudge-save"
              onClick={() => void handleSave()}
              disabled={saving}
              className="shrink-0 rounded-lg border border-emerald-300/35 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {t('rateNudge.save')}
            </button>
            <button
              type="button"
              data-testid="rate-nudge-not-now"
              onClick={dismiss}
              className="shrink-0 px-1 text-[11px] text-[#88a292] transition-colors hover:text-emerald-200"
            >
              {t('rateNudge.notNow')}
            </button>
          </div>
          {errorKey && (
            <p data-testid="rate-nudge-error" className="mt-1.5 text-[10px] text-amber-300/90">
              {t(errorKey)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
