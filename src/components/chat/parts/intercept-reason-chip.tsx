"use client";

import { Leaf } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { classifyInterceptReason, type InterceptReason } from "@/lib/intercept-reason";

export function interceptReasonTextKey(reason: InterceptReason): string {
  if (reason.kind === "non_green" && reason.category) {
    return `chat.interceptReason.nonGreen.${reason.category}`;
  }
  return `chat.interceptReason.${reason.kind}`;
}

export interface InterceptReasonChipProps {
  reason?: InterceptReason;
  itemTitle?: string;
  isDemo?: boolean;
}

export function InterceptReasonChip({
  reason,
  itemTitle,
  isDemo = false,
}: InterceptReasonChipProps) {
  const { t } = useI18n();
  const resolvedReason =
    reason ??
    classifyInterceptReason(isDemo ? itemTitle || " " : itemTitle || "");
  if (
    !resolvedReason ||
    resolvedReason.kind === "unknown" ||
    resolvedReason.kind === "budget"
  )
    return null;

  return (
    <div
      data-testid="intercept-reason-chip"
      className="mt-2 flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1"
    >
      <Leaf
        className="h-3 w-3 flex-shrink-0 text-emerald-300"
        aria-hidden="true"
      />
      <p className="truncate text-[11px] leading-5 text-emerald-50/90">
        <span className="font-semibold text-amber-200/85">
          {t("chat.interceptMoment.reasonLabel", {
            defaultValue: "Why Symy paused it",
          })}
          :
        </span>{" "}
        {t(interceptReasonTextKey(resolvedReason))}
      </p>
    </div>
  );
}
