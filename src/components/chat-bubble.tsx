'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
// 🔧 A1 移植 (commerce-agents "UI 组件即工具"): 卡片渲染走结构化边界组件
//    (复检后内部仍渲染 ProductCards), 旧字符串解析轨保留在 consume-ai-stream 作 fallback
import { StructuredProductCards } from '@/components/chat/parts/structured-cards';
import { ReuseHintCard } from '@/components/chat/parts/reuse-hint-card';
import { sanitizeLeakedReasoning } from '@/lib/reasoning-leak-guard';
// 🌱 绿色替代卡片: 非绿拦截→推荐链路的前端呈现 (纯建议, 无商城链接)
import { GreenAltCard } from '@/components/chat/parts/green-alt-card';
// 🌱 batch68-a 采纳后复盘卡: 追问轮附带 (4 个非羞辱选项 + 自由文本, 零金额)
import { GreenAltRetroCard } from '@/components/chat/parts/green-alt-retro-card';
// 🐞 batch46-b 微挑战卡: 24h 微型守护挑战提案 (陪伴叙事, 中性 chat 卡底色)
import { MicroChallengeCard } from '@/components/chat/parts/micro-challenge-card';
// 📖 batch47-a 知识问答来源 chip: 词条内容可展开 (替代选项 + 渠道, 零金额)
import { GreenKnowledgeChip } from '@/components/chat-parts/green-knowledge-chip';
// 🐘 batch48-b 冷静卡: 反驳降温轮的 24h 愿望单卡 (服务端预检 cooldown_card 事件附带)
import { CooldownCard } from '@/components/chat/parts/cooldown-card';
// 🐘 batch50-a 买前三问: 用户主动求问的三问决策卡 (服务端预检 prepurchase_card 事件附带)
import { PrepurchaseCard } from '@/components/chat/parts/prepurchase-card';
import { DuplicatePrecheckCard } from '@/components/chat/parts/duplicate-purchase-card';
// 🐘 batch53-a 绿色承诺: 用户口头承诺的登记卡 (服务端预检 commitment_card 事件附带)
import { CommitmentCard } from '@/components/chat/parts/commitment-card';
import { CompareCard } from '@/components/chat/parts/compare-card';
// 🐘 batch55-c 替代足迹: 用户召回足迹时的足迹卡
import { AltFootprintCard } from '@/components/chat/parts/alt-footprint-card';
// 🐘 batch57-a 清单分诊卡: 购物清单批量轮附带 (逐条三态 + 动作 chip; 纯计数零金额)
import { ListTriageCard } from '@/components/chat/parts/list-triage-card';
// 🐘 batch57-c 问账卡: 用户问账轮附带 (数字来自聚合 lib, 私享金额只进卡内)
import { SavingsQueryCard } from '@/components/chat/parts/savings-query-card';
// 🐘 batch58-c 分类/时段问答卡: 问句维度细化轮附带 (计数/天数, 零金额零分享面)
import { CategoryQueryCard } from '@/components/chat/parts/category-query-card';
import { ImpulseTimeCard } from '@/components/chat/parts/impulse-time-query-card';
// 🐘 batch62-c 冲动风险预报卡: 预报轮附带 (次数/天数/时段, 零金额零分享面)
import { ImpulseForecastCard } from '@/components/chat/parts/impulse-forecast-card';
// 🐘 batch68-c 按小时守护脉搏卡: 小时节奏问句轮附带 (小时/次数/天数, 零金额零分享面)
import { GuardPulseCard } from '@/components/chat/parts/guard-pulse-card';
// 🐘 batch60-c 情绪守护卡: 情绪×购物共现轮附带 (三选项, 零金额零物品名)
import { EmotionGuardCard } from '@/components/chat/parts/emotion-guard-card';
import { ContextSignalChips } from '@/components/chat/parts/context-signal-chips';
import { ContextTrustCard } from '@/components/chat/parts/context-trust-card';
import { ShoppingClarifyCard } from '@/components/chat/parts/shopping-clarify-card';

import type { ChatMessage } from '@/types/chat-message';
export type { ChatMessage };

interface ChatBubbleProps {
  message: ChatMessage;
  onDelete?: (id: string) => void;
  onSendMessage?: (content: string) => void | Promise<void>;
  /** 🔧 CL3 fix: 用户真实头像 URL (来自 user_metadata.avatar_url), 无则显示字母首字母 */
  userAvatarUrl?: string;
}

// 🔧 TECH-DEBT-C: React.memo prevents re-render of all N chat bubbles on every SSE token
export const ChatBubble = memo(function ChatBubble({ message, onDelete, userAvatarUrl, onSendMessage }: ChatBubbleProps) {
  const { t } = useI18n();
  const isUser = message.role === 'user';
  const isAction = message.role === 'action';
  // 🔧 P3-14 fix (2026-07-11): 统一时间戳格式 — 与 Book of seeing 事件一致用相对时间
  //   旧代码: toLocaleTimeString → "12:40 AM" (绝对时间)
  //   Book of seeing: "1h ago" (相对时间)
  //   两种格式混用, 用户困惑
  //   新代码: 同一天内用相对时间 (< 24h), 跨天用绝对日期 "MMM D, HH:MM"
  const formatChatTime = (date: Date): string => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return t('common.justNow');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('common.minutesAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('common.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('common.daysAgo', { n: days });
    // 超过 7 天用绝对日期 + 时间
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const timeStr = formatChatTime(message.timestamp);
  const [showDelete, setShowDelete] = useState(false);
  // 🔧 NEW-J fix: 用 state 替代 confirm() — confirm() 阻塞主线程导致反复弹窗
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 🔧 BUG-325 v6 fix: 不再做思考链检测 — 流式始终显示 content
  // finalMsg 时已在高确定性泄露时替换为 fallback，这里只管显示
  // 🔧 P0 信任修复: 渲染前过一道推理泄漏兜底 (保守判定, 见 reasoning-leak-guard.ts)
  const displayContent = sanitizeLeakedReasoning(message.content || '');

  // 🔧 Round 86 P0 fix: ALL hooks must be called before any early return.
  //    旧代码: useRef/useCallback/useEffect 在 `if (isAction) return` 之后,
  //    违反 React rules-of-hooks (isAction=true 时不调 hooks → 顺序变化 → crash).
  //    根因修复: 移动所有 hooks 到 early return 之前.

  // Mobile-friendly: show delete on long press or tap
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = useCallback(() => {
    touchTimerRef.current = setTimeout(() => setShowDelete(true), 500);
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    setShowDelete(false);
  }, []);

  // 🔧 BUG-259 fix: 组件卸载时清理 touchTimer
  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    };
  }, []);

  // 🔧 P1-2 fix: action 消息渲染为居中的状态徽章 (非用户气泡, 非 AI 气泡)
  //   - saw_it: 绿色 ✓ 徽章 ("✓ Saw it")
  //   - chose_to_buy: 橙色 ✗ 徽章 ("✗ Chose to buy")
  //   - challenge_created: 蓝色 🪞 徽章
  if (isAction) {
    const actionConfig: Record<string, { icon: string; color: string; bg: string }> = {
      saw_it: {
        icon: '✓',
        color: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-500/10 border-green-500/20',
      },
      chose_to_buy: {
        icon: '✗',
        color: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-500/10 border-orange-500/20',
      },
      challenge_created: {
        icon: '🐘',
        color: 'text-cyan-600 dark:text-cyan-400',
        bg: 'bg-cyan-500/10 border-cyan-500/20',
      },
    };
    const config = actionConfig[message.actionType || ''] || actionConfig.saw_it;
    return (
      <div className="flex justify-center mb-3">
        <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-sm', config.bg, config.color)}>
          <span className="text-sm leading-none">{config.icon}</span>
          <span>{displayContent}</span>
          <span className="text-[10px] opacity-50 ml-1">{timeStr}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex gap-2 mb-4 group', isUser ? 'flex-row-reverse' : 'flex-row')}
      // 🔧 NEW-021 fix: 不再用 onMouseEnter 自动显示删除按钮 — 用户报告"自动显示"
      //    改为点击/长按才显示 (与移动端一致)
      onMouseLeave={() => { setShowDelete(false); setConfirmingDelete(false); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Avatar */}
      {/* 🔧 CL3 fix: 用户头像优先用真实头像 (user_metadata.avatar_url), AI 头像用 Symy elephant
          🔧 头像显示 fix: object-position: top 让人物头部不被圆形裁剪切掉 (竖图中心通常是人脸) */}
      {isUser && userAvatarUrl ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10 relative">
          <Image src={userAvatarUrl} alt={t('chat.avatarUser')} fill className="w-full h-full object-cover" style={{ objectPosition: 'top' }} unoptimized />
        </div>
      ) : isUser ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-cyan-500 to-purple-500 text-white">
          {t('chat.avatarUser')}
        </div>
      ) : (
        /* 🔧 V3-7 fix: AI 头像从 🪞 改为 🐘 (Symy 是小象不是镜子) */
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10 flex items-center justify-center bg-gradient-to-br from-cyan-500/30 to-purple-500/30">
          <span className="text-base leading-none">🐘</span>
        </div>
      )}

      {/* Bubble — Glass effect */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 relative',
          isUser
            ? 'bg-gradient-to-r from-cyan-500 to-purple-500 dark:from-cyan-500/15 dark:to-purple-500/15 border border-cyan-400/15 text-white dark:text-white rounded-br-md backdrop-blur-sm'
            : message.isError
              ? 'bg-red-500/10 dark:bg-red-500/15 border border-red-500/30 text-text-primary rounded-bl-md backdrop-blur-sm'
              : 'bg-glass-fill dark:bg-white/[0.12] border border-glass-border text-text-primary rounded-bl-md backdrop-blur-sm'
        )}
      >
        {/* Delete button (hover to show) — NEW-J fix: 两步确认替代 confirm() */}
        {showDelete && onDelete && !confirmingDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConfirmingDelete(true);
            }}
            className={cn(
              'absolute top-1 w-5 h-5 rounded-full bg-glass-fill hover:bg-red-500/60',
              'flex items-center justify-center transition-colors z-10 backdrop-blur-sm',
              isUser ? '-left-2' : '-right-2'
            )}
            title={t('chat.deleteMessage')}
            aria-label={t('chat.deleteMessage')}
          >
            <X className="w-3 h-3 text-text-secondary" />
          </button>
        )}
        {/* NEW-J fix: 确认删除 UI (替代 confirm 弹窗) */}
        {confirmingDelete && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-1.5 rounded-2xl bg-glass-fill-strong/95 backdrop-blur-sm px-2">
            <span className="text-[10px] text-text-secondary truncate flex-1">
              {t('chat.deleteConfirm', { defaultValue: 'Delete?' })}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete?.(message.id);
                setConfirmingDelete(false);
                setShowDelete(false);
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
            >
              {t('chat.deleteMessage', { defaultValue: 'Delete' })}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setConfirmingDelete(false);
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-glass-fill text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        )}

        {message.isError && (
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        )}

        {/* 🔧 P1-2 fix: AI 消息内容为空时 (流式未开始或 token 还没到),
            显示 typing 三点动画替代空气泡 + 时间戳.
            旧代码: displayContent='' 时渲染空 markdown + 时间戳, 用户看到空气泡困惑.
            修复: 内容为空且非错误时, 显示 typing indicator. */}
        {!isUser && !message.isError && !displayContent.trim() ? (
          <div className="flex items-center gap-2 py-0.5">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[11px] text-text-tertiary">
              {t('chat.symyTyping', { defaultValue: 'Symy is typing...' })}
            </span>
          </div>
        ) : (
          /* 🔧 NEW-YYY fix: Markdown 渲染 (之前显示原始文本) */
          <div className="text-sm leading-relaxed whitespace-pre-wrap [&_p]:my-0 [&_strong]:font-bold [&_em]:italic [&_code]:bg-glass-fill [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
            <ReactMarkdown
              // 🔧 架构优化 Round 69 (Finding 8): 安全加固 — 禁用 img/script/iframe, 限制 URL scheme
              disallowedElements={['img', 'script', 'iframe', 'form', 'input', 'object', 'embed']}
              unwrapDisallowed
              urlTransform={(url) => /^https?:\/\//i.test(url) ? url : ''}
              components={{
                p: ({ children }) => <span>{children}</span>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => <code className="bg-glass-fill px-1 rounded text-xs">{children}</code>,
                // 🔧 安全: 所有链接强制 target=_blank + rel=noopener
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan-400 underline">
                    {children}
                  </a>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}

        {message.productCards?.length ? <StructuredProductCards cards={message.productCards} query={message.productCardsQuery} /> : null}

        {/* 🐘 batch61-b 弱信号词 chips (小象识别到的信号, 可逐个纠正; 会话内一次纠正不再重复) */}
        {message.contextSignal ? <ContextSignalChips data={message.contextSignal} /> : null}
        {message.contextTrust ? <ContextTrustCard evidence={message.contextTrust} /> : null}
        {message.shoppingClarifyCard ? <ShoppingClarifyCard data={message.shoppingClarifyCard} onSendMessage={onSendMessage} /> : null}

        {/* 🌱 绿色替代卡 (green_alt SSE / JSON 附带) — 双卡命中时 green 在上 */}
        {message.greenAlt ? <GreenAltCard data={message.greenAlt} /> : null}
        {/* 🌱 batch68-a 采纳后复盘卡 (green_alt_retro SSE / JSON 附带; 选项点击即发收束轮) */}
        {message.greenAltRetro ? <GreenAltRetroCard data={message.greenAltRetro} onSendMessage={onSendMessage} /> : null}
        {/* 🔁 复用优先: "先看看已有的" 建议卡 (服务端预检 reuse_hint 事件附带; guard-off 时卡内自静默) */}
        {message.reuseHint ? <ReuseHintCard hint={message.reuseHint} /> : null}
        {/* 🐞 batch46-b 微挑战卡: 24h 微型守护挑战提案 (服务端预检 micro_challenge 事件附带; guard-off 时卡内自静默) */}
        {message.microChallenge ? <MicroChallengeCard proposal={message.microChallenge} /> : null}
        {/* 📖 batch47-a 知识问答来源 chip (服务端预检 green_knowledge 事件附带; guard-off 时卡内自静默) */}
        {message.greenKnowledge ? <GreenKnowledgeChip data={message.greenKnowledge} /> : null}
        {/* 🐘 batch48-b 冷静卡 (反驳降温轮附带; guard-off 时卡内自静默) */}
        {message.cooldownCard ? <CooldownCard data={message.cooldownCard} /> : null}
        {/* 🐘 batch50-a 买前三问决策卡 (用户主动求问轮附带; 用户自己的问题不受守护开关静默) */}
        {message.prepurchaseCard ? <PrepurchaseCard data={message.prepurchaseCard} /> : null}
        {message.duplicatePrecheckCard ? <DuplicatePrecheckCard data={message.duplicatePrecheckCard} /> : null}
        {/* 🐘 batch60-c 情绪守护卡 (情绪×购物共现轮附带; 三选项不评判, 花钱分支零事件) */}
        {message.emotionGuardCard ? <EmotionGuardCard data={message.emotionGuardCard} /> : null}
        {/* 🐘 batch53-a 承诺登记卡 (用户口头承诺轮附带; 用户自己的承诺不受守护开关静默) */}
        {message.commitmentCard ? <CommitmentCard data={message.commitmentCard} /> : null}
        {/* 🐘 batch56-a 对比裁决卡 (用户二选一求问轮附带; 用户自己的问题不受守护开关静默) */}
        {message.compareCard ? <CompareCard data={message.compareCard} /> : null}
        {/* 🐘 batch55-c 替代足迹卡 (用户召回自己的替代足迹轮附带; App 内私享金额永不进分享面) */}
        {message.altFootprint ? <AltFootprintCard data={message.altFootprint} /> : null}
        {/* 🐘 batch57-a 清单分诊卡 (购物清单批量轮附带; 用户自己的清单不受守护开关静默) */}
        {message.listTriageCard ? <ListTriageCard data={message.listTriageCard} /> : null}
        {/* 🐘 batch57-c 问账卡 (用户问账轮附带; 数字来自聚合 lib, 私享金额只进卡内) */}
        {message.savingsQueryCard ? <SavingsQueryCard data={message.savingsQueryCard} /> : null}
        {/* 🐘 batch58-c 分类/时段问答卡 (问句维度细化轮附带; 计数/天数, 零金额) */}
        {message.categoryQueryCard ? <CategoryQueryCard data={message.categoryQueryCard} /> : null}
        {message.impulseTimeCard ? <ImpulseTimeCard data={message.impulseTimeCard} /> : null}
        {/* 🐘 batch62-c 预报卡 (预报轮附带; 次数/天数/时段, 提前准备框架) */}
        {message.impulseForecastCard ? <ImpulseForecastCard data={message.impulseForecastCard} /> : null}
        {/* 🐘 batch68-c 脉搏卡 (小时节奏问句轮附带; 小时/次数/天数, 看见节奏非评判) */}
        {message.guardPulseCard ? <GuardPulseCard data={message.guardPulseCard} /> : null}

        {message.isError && message.onRetry && (
          <button
            onClick={message.onRetry}
            className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-medium hover:bg-red-500/30 transition-all active:scale-[0.98] flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('chat.aiFallback.retry', { defaultValue: 'Retry' })}
          </button>
        )}

        <p
          className={cn(
            'text-[10px] mt-1.5',
            isUser ? 'text-cyan-600/40 dark:text-cyan-300/40' : 'text-text-tertiary'
          )}
        >
          {timeStr}
        </p>
      </div>
    </div>
  );
});
