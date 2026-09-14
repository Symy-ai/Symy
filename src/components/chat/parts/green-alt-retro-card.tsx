'use client';

/**
 * GreenAltRetroCard — 绿色采纳后复盘卡 (batch68-a)
 *
 * 上一条消息的绿色替代卡被采纳后, 追问轮在 AI 回复气泡下方渲染此卡:
 * 4 个非羞辱选项 (手头已有 / 租借更省事 / 先试一次 / 想减少闲置) +
 * 自由文本提示 + 「先不聊这个」温和出口。选项文案全部来自客户端 i18n
 * (chat.greenAltRetro.option.*), 面上零金额零碳数值。
 *
 * 交互: 点选项 → 本地进已记录态 + 暂存结构化草稿 + 以选项文案作为一条
 * 普通聊天消息发送 (服务端按 body.greenAltRetroAnswer.optionId 给 canned
 * 收束)。自由文本 = 用户直接打字发送 (服务端按 awaiting 会话态判定)。
 * 「先不聊这个」→ 清 awaiting + 记终态, 不追问不误判。终态会话内回放。
 */

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { GreenAltRetroCardData } from '@/types/green-alt-retro';
import {
  getGreenAltRetroOutcome,
  markGreenAltRetroAnswered,
  markGreenAltRetroDismissed,
  stageGreenAltRetroOptionDraft,
  type GreenAltRetroOutcome,
} from './green-alt-retro-store';

export function GreenAltRetroCard({
  data,
  onSendMessage,
}: {
  data: GreenAltRetroCardData;
  onSendMessage?: (content: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<GreenAltRetroOutcome | null>(null);

  useEffect(() => {
    // 会话内终态回放: 已回答/已关闭的复盘卡不再弹选项
    setOutcome(getGreenAltRetroOutcome(data.entryId));
  }, [data.entryId]);

  // 「先不聊这个」: 卡片整体消失, 清 awaiting — 下一条消息不被当成回答
  if (outcome === 'dismissed') return null;

  const handleOption = (optionId: GreenAltRetroCardData['options'][number]) => {
    if (outcome) return;
    markGreenAltRetroAnswered(data.entryId);
    setOutcome('answered');
    stageGreenAltRetroOptionDraft(data.entryId, optionId);
    void onSendMessage?.(t(`chat.greenAltRetro.option.${optionId}`));
  };

  const handleDismiss = () => {
    if (outcome) return;
    markGreenAltRetroDismissed(data.entryId);
    setOutcome('dismissed');
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-emerald-500/20 bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.greenAltRetro.askTitle')}
      data-testid="green-alt-retro-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Sprout className="h-3 w-3" aria-hidden />
        <span>{t('chat.greenAltRetro.askTitle')}</span>
      </h4>

      {outcome === 'answered' ? (
        <p
          className="mt-1.5 text-[11px] leading-relaxed text-text-secondary"
          data-testid="green-alt-retro-answered-note"
        >
          {t('chat.greenAltRetro.answeredNote')}
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {data.options.map((optionId) => (
              <button
                key={optionId}
                type="button"
                onClick={() => handleOption(optionId)}
                className="rounded-full border border-glass-border bg-glass-fill px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-emerald-500/30 hover:text-text-primary"
                data-testid={`green-alt-retro-option-${optionId}`}
              >
                {t(`chat.greenAltRetro.option.${optionId}`)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-text-secondary">
              {t('chat.greenAltRetro.freeTextHint')}
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] text-text-secondary/70 transition-colors hover:text-text-secondary"
              data-testid="green-alt-retro-dismiss"
            >
              {t('chat.greenAltRetro.dismiss')}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
