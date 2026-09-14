"use client";

import { useEffect, useState } from "react";
import { Medal, Share2, X } from "lucide-react";
import { ShareModal } from "@/components/share/share-modal";
import { useI18n } from "@/i18n/provider";
import { useHourlyRate } from "@/hooks/use-hourly-rate";
import { moneyToFreedomLabel } from "@/lib/freedom-time";
import { formatCurrency } from "@/lib/format";
import { classifyInterceptReason } from "@/lib/intercept-reason";
import { INTERCEPT_MEDAL_EVENT } from "@/lib/intercept-medal";
import { InterceptReasonChip } from "@/components/chat/parts/intercept-reason-chip";
import type { InterceptMedalData } from "@/types/intercept-medal";

export interface InterceptMedalMomentProps {
  streakDays?: number;
  isDemo?: boolean;
}

export function InterceptMedalMoment({
  streakDays,
  isDemo = false,
}: InterceptMedalMomentProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  const [medal, setMedal] = useState<InterceptMedalData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InterceptMedalData>).detail;
      if (
        !dismissed &&
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
  }, [dismissed, isDemo]);

  if (!medal) return null;

  const savedHours = moneyToFreedomLabel(medal.savedCents / 100, locale, hourlyRate);
  const savedMoney = formatCurrency(medal.savedCents / 100);

  return (
    <>
      <div
        data-testid="intercept-medal-moment"
        className="pointer-events-auto absolute inset-x-3 top-3 z-30 animate-in slide-in-from-top-4 fade-in duration-500 sm:inset-x-6"
      >
        <div className="relative overflow-hidden rounded-[28px] border border-amber-300/35 bg-[linear-gradient(135deg,#143527_0%,#17462f_52%,#0d2b1e_100%)] p-4 shadow-[0_22px_60px_-22px_rgba(20,53,39,0.85)]">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 left-8 h-28 w-28 rounded-full bg-emerald-300/15 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-300/45 bg-amber-300/12 shadow-inner">
              <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-200/20 to-transparent" />
              <Medal
                className="relative h-6 w-6 text-amber-200"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug text-amber-100">
                {t("chat.interceptMoment.title", {
                  defaultValue: "Fresh from the green gate!",
                })}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-50/85">
                {t("chat.interceptMoment.description", {
                  defaultValue:
                    "Your guard became a medal — that time is yours again.",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                setShowShareModal(false);
                setMedal(null);
              }}
              aria-label={t("common.close", { defaultValue: "Close" })}
              className="rounded-full border border-emerald-100/15 p-1.5 text-emerald-100/70 transition hover:border-emerald-100/35 hover:text-emerald-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="relative mt-4 grid gap-2 rounded-2xl border border-emerald-100/12 bg-emerald-950/35 p-3 sm:grid-cols-3">
            {streakDays !== undefined && streakDays > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">
                  {t("chat.interceptMoment.streakLabel", {
                    defaultValue: "Guard streak",
                  })}
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-50">
                  {t("chat.interceptMoment.streak", {
                    days: streakDays,
                    defaultValue: "{days} days",
                  })}
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">
                {t("chat.interceptMoment.wonBackLabel", {
                  defaultValue: "Won back",
                })}
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-50">
                {savedHours}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">
                {t("chat.interceptMoment.amountLabel", {
                  defaultValue: "This guard",
                })}
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-50">
                {t("chat.interceptMoment.amount", {
                  amount: savedMoney,
                  defaultValue: "{amount}",
                })}
              </p>
            </div>
          </div>

          <InterceptReasonChip reason={medal.reason} />

          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            data-testid="chat-show-off-medal-button"
            className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-200 via-amber-300 to-emerald-300 px-4 py-3 text-sm font-bold text-[#10291e] transition hover:brightness-105 active:scale-[0.99]"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t("chat.interceptMoment.share", {
              defaultValue: "Show off this medal",
            })}
          </button>
        </div>
      </div>
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        medal={medal}
        streakDays={streakDays}
      />
    </>
  );
}
