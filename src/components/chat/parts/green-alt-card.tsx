'use client';

/**
 * GreenAltCard — 绿色替代卡片 (非绿拦截→推荐链路的前端呈现)
 *
 * chat route 在发 Letta 前做关键词预检 (green-alternatives 词库), 命中
 * 高环境影响品类且绿色守护开启时, 响应带 green_alt 标记, ChatBubble 在
 * AI 回复气泡下方渲染此卡:
 *   1. 为什么环境影响高 (一句, 不说教, 无碳数值)
 *   2. 2-3 个具体绿色替代选项
 *   3. 复用方案 (手头已有 + 二手/租赁渠道)
 * 话术全部来自服务端 green-alternatives.ts (荣誉框架: "你在做对的事")。
 * 纯建议卡: 无商城链接, 点击不跳转。绿色守护开关关闭时整体静默。
 */

import { useEffect, useState } from 'react';
import { Check, Leaf, Recycle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
// 🌱 绿色守护开关: 关闭时卡片整体静默 (与商品卡绿色徽章同一开关)
import { useGreenPref } from '@/hooks/use-green-pref';
// 🛡️ batch48-a: 守护强度三档 — strict 追加 24h 微挑战入口尾句; gentle 去掉追问类尾句
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
// 🗺️ batch53-b: 守护范围 — 加严品类同样追加 strict 档尾句 (仅该品类生效)
import { useGuardScope } from '@/hooks/use-guard-scope';
import { isCategoryStrict } from '@/lib/guard-scope';
import {
  greenAltIdToMicroChallengeCategory,
  shouldShowAdoptConfirm,
  shouldShowChallengeInvite,
} from '@/lib/guard-intensity';
import { isGreenAltAdoptionReported, reportGreenAltAdoption } from '@/components/chat-parts/green-alt-adoption';
// 🐘 batch62-b: 拒绝反馈 — 4 个非羞辱原因写既有 manual_adjustment 审计通道,
// 小象把原因转为短期偏好 (冷却/换渠道表达), 之后少打扰或换个路子
import {
  GREEN_ALT_REJECTION_REASONS,
  type GreenAltRejectionReason,
} from '@/lib/green-alt-preference';
import {
  latestGreenAltRejectionReason,
  reportGreenAltRejection,
} from '@/components/chat-parts/green-alt-rejection';
import { MicroChallengeCard } from './micro-challenge-card';
import type { GreenAltCardData } from '@/types/green-alt-card';

export function GreenAltCard({ data }: { data: GreenAltCardData }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const { guardIntensity } = useGuardIntensity();
  const { guardScope } = useGuardScope();
  const [adopted, setAdopted] = useState(false);
  // 🐘 batch62-b: 已选择的拒绝原因 (localStorage 回放跨会话已确认态)
  const [rejection, setRejection] = useState<GreenAltRejectionReason | null>(null);
  // strict 尾句入口展开态: 点击后渲染既有 24h 微挑战卡 (不新写挑战逻辑)
  const [challengeOpen, setChallengeOpen] = useState(false);

  useEffect(() => {
    // 跨会话去重: localStorage 已上报过的卡片直接进已确认态
    if (isGreenAltAdoptionReported(data.id)) setAdopted(true);
    // 拒绝反馈同理: 最近一次拒绝原因回放为已确认态 (冷却过期后用户可再给)
    setRejection(latestGreenAltRejectionReason(data.id));
  }, [data.id]);

  if (!greenPrefEnabled) return null;

  const handleAdopt = async () => {
    if (adopted) return;
    setAdopted(true); // 先进已确认态防连点重复上报 (本地 + API 双层幂等)
    await reportGreenAltAdoption(data.id);
  };

  // 🐘 batch62-b: 记录拒绝原因 — 先进已确认态防连点 (本地日志 + 载荷双层幂等), 失败静默
  const handleReject = async (reason: GreenAltRejectionReason) => {
    if (rejection) return;
    setRejection(reason);
    await reportGreenAltRejection(data.id, reason);
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-emerald-500/20 bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.greenAlt.title')}
      data-testid="green-alt-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>🌱</span>
        <span>{t('chat.greenAlt.title')}</span>
      </h4>

      {/* 为什么环境影响高 — 一句陈述, 不说教 */}
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{data.why}</p>

      {/* 2-3 个具体绿色替代选项 */}
      <p className="mt-2 text-[11px] font-medium text-text-secondary">
        {t('chat.greenAlt.optionsTitle')}
      </p>
      <ul className="mt-1 space-y-1">
        {data.options.map((option) => (
          <li key={option} className="flex items-start gap-1.5 text-xs leading-relaxed text-text-primary">
            <Leaf className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" aria-hidden />
            <span>{option}</span>
          </li>
        ))}
      </ul>

      {/* 复用方案: 手头已有 + 二手/租赁渠道 */}
      <div className="mt-2 space-y-1 border-t border-glass-border pt-2">
        <p className="text-[11px] font-medium text-text-secondary">
          {t('chat.greenAlt.reuseTitle')}
        </p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
          <Recycle className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" aria-hidden />
          <span>{data.reuse}</span>
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">{data.reuseChannel}</p>
      </div>

      {/* 荣誉框架收尾: "你在做对的事" (tone 与 green-alternatives.ts 一致) */}
      <p className="mt-2 text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80">
        {t('chat.greenAlt.honorNote')}
      </p>

      {/* 采纳确认: 轻量次级动作, 点击式防误触; 上报失败静默降级。
          🛡️ batch48-a: gentle 档去掉追问类尾句 — 采纳确认行整体隐藏 */}
      {shouldShowAdoptConfirm(guardIntensity) && (
        <div className="mt-2 border-t border-glass-border pt-2">
          {adopted ? (
            <p
              className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              data-testid="green-alt-adopted-note"
            >
              <Check className="h-3 w-3" aria-hidden />
              <span>{t('chat.greenAlt.adoptedNote')}</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleAdopt}
              className="w-full rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-emerald-500/30 hover:text-text-primary"
              data-testid="green-alt-adopt-button"
            >
              {t('chat.greenAlt.adoptButton')}
            </button>
          )}
        </div>
      )}

      {/* 🐘 batch62-b 拒绝反馈: 未采纳时的轻量反馈区 — 4 个非羞辱原因
          (采纳后不显示; gentle 档与采纳确认行同一静默口径, 不追问) */}
      {shouldShowAdoptConfirm(guardIntensity) && !adopted && (
        <div className="mt-2 border-t border-glass-border pt-2" data-testid="green-alt-feedback">
          {rejection ? (
            <p
              className="flex items-center gap-1.5 text-[11px] text-text-secondary"
              data-testid="green-alt-feedback-ack"
            >
              <span aria-hidden>🐘</span>
              <span>{t(`chat.greenAlt.feedbackAck.${rejection}`)}</span>
            </p>
          ) : (
            <>
              <p className="text-[11px] font-medium text-text-secondary">
                {t('chat.greenAlt.feedbackTitle')}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {GREEN_ALT_REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => handleReject(reason)}
                    className="rounded-full border border-glass-border bg-glass-fill px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-emerald-500/30 hover:text-text-primary"
                    data-testid={`green-alt-feedback-${reason}`}
                  >
                    {t(`chat.greenAlt.feedbackReason.${reason}`)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 🛡️ batch48-a strict 尾句: 24h 微挑战入口 — 点击展开既有 MicroChallengeCard
          (提案品类由卡片 id 映射; 复用既有挑战创建链路, 不新写挑战逻辑)
          🗺️ batch53-b: 守护范围加严品类追加同一尾句 (仅该品类生效) */}
      {(shouldShowChallengeInvite(guardIntensity) || isCategoryStrict(guardScope, greenAltIdToMicroChallengeCategory(data.id))) && !challengeOpen && (
        <button
          type="button"
          onClick={() => setChallengeOpen(true)}
          className="mt-2 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          data-testid="green-alt-challenge-invite"
        >
          {t('chat.greenAlt.challengeInvite')}
        </button>
      )}
      {challengeOpen && (
        <MicroChallengeCard
          proposal={{
            category: greenAltIdToMicroChallengeCategory(data.id),
            titleKey: `chat.microChallenge.body.${greenAltIdToMicroChallengeCategory(data.id)}`,
            durationHours: 24,
          }}
        />
      )}
    </aside>
  );
}
