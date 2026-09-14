"use client";

/**
 * InterceptMedalBanner — 拦截勋章横幅 + 分享弹窗入口 (绿色转向 / 传播引擎)
 *
 * 自包含组件: 监听聊天工具流派发的 INTERCEPT_MEDAL_EVENT (complete_challenge passed =
 * 用户没买 = 勋章), 在 Buddy 页通知区域显示「晒出这枚勋章」→ 打开 ShareModal。
 * banner 保持到用户关闭 (用户从 Chat tab 切过来需要时间, 不做自动消失)。
 *
 * 零 DDL: 勋章数据只在客户端 session 内流转, streak 从现有 buddyState.streak 由父组件传入。
 */

import { useEffect, useState } from "react";
import { Medal, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useHourlyRate } from "@/hooks/use-hourly-rate";
import { INTERCEPT_MEDAL_EVENT } from "@/lib/intercept-medal";
import { classifyInterceptReason } from "@/lib/intercept-reason";
import { InterceptReasonChip } from "@/components/chat/parts/intercept-reason-chip";
import type { InterceptMedalData } from "@/types/intercept-medal";
import { moneyToFreedomLabel } from "@/lib/freedom-time";
import { ShareModal } from "@/components/share/share-modal";
import { normalizeInterceptCategory, CATEGORY_WARM_COPY, type InterceptCategory } from "@/features/butterfly/green-alt-copy";

export interface InterceptMedalBannerProps {
  /** 连续拦截天数 — 从现有 buddyState.streak 读, 0/undefined 时卡片隐藏该行 */
  streakDays?: number;
  isDemo?: boolean;
}

export function InterceptMedalBanner({
  streakDays,
  isDemo = false,
}: InterceptMedalBannerProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  const [medal, setMedal] = useState<InterceptMedalData | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<InterceptMedalData>).detail;
      if (
        detail &&
        Number.isFinite(detail.savedCents) &&
        detail.savedCents > 0
      ) {
        setMedal({
          ...detail,
          reason:
            detail.reason ??
            (detail.itemTitle
              ? classifyInterceptReason(detail.itemTitle)
              : isDemo
                ? { kind: "impulse" }
                : { kind: "unknown" }),
        });
      }
    };
    window.addEventListener(INTERCEPT_MEDAL_EVENT, handler);
    return () => window.removeEventListener(INTERCEPT_MEDAL_EVENT, handler);
  }, [isDemo]);

  if (!medal) return null;

  const itemLabel =
    medal.itemTitle ||
    t("share.interceptMedal.fallbackItem", { defaultValue: "this one" });
  const savedTime = moneyToFreedomLabel(medal.savedCents / 100, locale, hourlyRate);

  const categoryId: InterceptCategory = normalizeInterceptCategory(medal.reason?.category);
  const warmLine = t(CATEGORY_WARM_COPY[categoryId].lineKey, {
    defaultValue: 'A guard worth keeping.',
  });
  const warmTpl = medal.savedCents > 0
    ? t('chat.interceptWarm.bannerWithHours', { hours: savedTime, line: warmLine, defaultValue: `+{hours} free hours — ${warmLine}` })
    : t('chat.interceptWarm.bannerNoAmount', { line: warmLine, defaultValue: `+0 free hours — ${warmLine}` });

  return (
    <>
      <div
        className="mx-4 mb-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-green-500/15 border border-emerald-500/30 shadow-lg"
        data-testid="intercept-medal-banner"
      >
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <Medal
              className="w-3.5 h-3.5 text-emerald-400"
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-text-primary leading-relaxed font-medium">
              {t("share.interceptMedal.bannerTitle", {
                defaultValue: "You just won this one",
              })}
            </p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {t("share.interceptMedal.bannerSub", {
                defaultValue: `Skipped ${itemLabel} — ${savedTime} of your life stays yours`,
                item: itemLabel,
                amount: savedTime,
              })}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-emerald-200/80">
              {warmTpl}
            </p>
          </div>
          <InterceptReasonChip reason={medal.reason} />
          <button
            onClick={() => setMedal(null)}
            aria-label={t("common.close", { defaultValue: "Close" })}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-glass-hover text-text-tertiary transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => setShowShareModal(true)}
          data-testid="show-off-medal-button"
          className="mt-2 w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-[#0c2017] text-xs font-bold hover:from-emerald-400 hover:to-green-400 active:scale-[0.98] transition-all cursor-pointer select-none flex items-center justify-center gap-1.5"
        >
          <Medal className="w-3.5 h-3.5" aria-hidden="true" />
          {t("share.interceptMedal.showOff", {
            defaultValue: "Show off this medal",
          })}
        </button>
      </div>

      {/* 分享卡弹窗 — PNG 生成 → Web Share / 下载 */}
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        medal={medal}
        streakDays={streakDays}
      />
    </>
  );
}
