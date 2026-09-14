/**
 * P1-5: Proactive Message Banner — Symy 主动留言横幅 (增强版)
 *
 * 在 Buddy tab 顶部显示最新一条未读主动留言
 * 用户可关闭 (标记已读) 或查看全部历史留言
 *
 * 🔧 QA enhancement: +N more 可点击 → 打开留言档案弹窗
 * 🔧 message-variety fix (本轮): 加分类标签 (Encouragement / Companionship / Care / Reflection)
 *   - 每条消息按 trigger 映射到 4 大分类
 *   - 在 banner + archive modal 显示分类标签 (emoji + 颜色)
 *   - 帮助用户快速识别消息类型 (鼓励/陪伴/关怀/反思邀请)
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n } from '@/i18n/provider';
import { apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ProactiveMessage, ProactiveMessageTrigger } from '@/types/buddy-state';
// 🔧 message-variety fix: 引入分类映射 + 元数据
import {
  TRIGGER_CATEGORY,
  CATEGORY_META,
  type MessageCategory,
} from '@/lib/buddy-proactive-messages';

interface ProactiveMessageBannerProps {
  messages: ProactiveMessage[];
  onMarkRead?: (messageId: string) => void;
}

/** 触发类型 → emoji 映射 (保留, 用于 archive modal 单条消息展示) */
const TRIGGER_EMOJI: Record<ProactiveMessageTrigger, string> = {
  morning_checkin: '🌅',
  evening_reflection: '🌙',
  long_absence: '👋',
  streak_milestone: '🔥',
  challenge_completed: '✨',
  challenge_failed: '💪',
  low_vitality: '🤗',
  high_vitality: '🌸',
  personality_awakened: '🎭',
  growth_stage_up: '🌱',
};

/**
 * 🔧 message-variety fix: 渲染分类标签
 *   - 鼓励 (encouragement): emerald ✨
 *   - 陪伴 (companionship): cyan 🌅
 *   - 关怀 (care): amber 🤗
 *   - 反思邀请 (reflection_invite): purple 💭
 */
function CategoryTag({
  trigger,
  isLight,
  label,
}: {
  trigger: ProactiveMessageTrigger;
  isLight: boolean;
  label: string;
}) {
  const category: MessageCategory = TRIGGER_CATEGORY[trigger];
  const meta = CATEGORY_META[category];
  const classes = isLight ? meta.lightClasses : meta.darkClasses;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-px rounded-full border ${classes}`}
      title={label}
    >
      <span className="text-[10px] leading-none">{meta.emoji}</span>
      <span>{label}</span>
    </span>
  );
}

/** 格式化时间为相对时间 */
function formatRelativeTime(iso: string, locale: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (locale === 'zh') {
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(iso).toLocaleDateString('zh-CN');
  }
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US');
}

export function ProactiveMessageBanner({ messages, onMarkRead }: ProactiveMessageBannerProps) {
  const { t, locale } = useI18n();
  const { resolvedTheme } = useTheme();
  // 🔧 message-variety fix: 用 resolvedTheme 判断 light/dark, 给 CategoryTag 选对颜色
  const isLight = typeof window !== 'undefined' ? resolvedTheme === 'light' : false;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);

  // 找最新未读 + 未关闭的留言
  const visibleMessage = messages
    .filter(m => !m.read && !dismissedIds.has(m.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const unreadCount = messages.filter(m => !m.read && !dismissedIds.has(m.id)).length;
  const totalCount = messages.length;

  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleClose = useCallback(async () => {
    if (!visibleMessage) return;
    setIsClosing(true);

    // 立即从 UI 移除 (乐观更新)
    setDismissedIds(prev => new Set(prev).add(visibleMessage.id));
    onMarkRead?.(visibleMessage.id);

    // 后台调 API 标记已读
    try {
      await apiFetchVoid('/api/buddy/proactive-messages', {
        method: 'POST',
        body: { messageId: visibleMessage.id },
      });
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Proactive Message Banner] Failed to mark read:', err);
      // 失败不回滚 UI (用户已经关了, 下次刷新会重新看到)
    } finally {
      setIsClosing(false);
    }
  }, [visibleMessage, onMarkRead]);

  // Archive modal: Escape to close + click outside
  useEffect(() => {
    if (!showArchive) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowArchive(false); };
    const handleClickOutside = (e: MouseEvent) => {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) setShowArchive(false);
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    // proactive-message-banner 在 Buddy 主页 (不在 CompanionDetailModal 内)
    // 所以它需要自己管理 body scroll lock
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [showArchive]);

  // 留言文本: 优先用 i18n key, fallback 到 textFallback
  const messageText = visibleMessage ? t(visibleMessage.textKey, { defaultValue: visibleMessage.textFallback }) : '';

  return (
    <>
      {visibleMessage && (
        <div
          className={`mx-4 mb-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 shadow-lg transition-all duration-300 ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {/* Symy 图标 */}
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-500/40 flex items-center justify-center text-xs">
              🐘
            </div>

            {/* 留言内容 */}
            <div className="flex-1 min-w-0">
              {/* 🔧 message-variety fix: 分类标签 (Encouragement / Companionship / Care / Reflection) */}
              <div className="mb-1">
                <CategoryTag
                  trigger={visibleMessage.trigger}
                  isLight={isLight}
                  label={t(CATEGORY_META[TRIGGER_CATEGORY[visibleMessage.trigger]].labelKey, {
                    defaultValue: CATEGORY_META[TRIGGER_CATEGORY[visibleMessage.trigger]].labelFallback,
                  })}
                />
              </div>
              <p className="text-[11px] text-text-primary leading-relaxed">{messageText}</p>
              {unreadCount > 1 && (
                <button
                  type="button"
                  onClick={() => setShowArchive(true)}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300 mt-0.5 transition-colors inline-flex items-center gap-0.5"
                >
                  {t('buddy.proactiveMessagesMore', { defaultValue: `+{count} more — tap to view all`, count: unreadCount - 1 })}
                </button>
              )}
            </div>

            {/* 查看全部按钮 (有历史留言时) */}
            {totalCount > 1 && (
              <button
                type="button"
                onClick={() => setShowArchive(true)}
                className="flex-shrink-0 w-5 h-5 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-cyan-400 transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                aria-label={t('buddy.proactiveMessagesArchive', { defaultValue: 'View all messages' })}
                tabIndex={0}
                title={t('buddy.proactiveMessagesArchive', { defaultValue: 'View all messages' })}
              >
                <MessageCircle className="w-2.5 h-2.5" />
              </button>
            )}

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={handleClose}
              className="flex-shrink-0 w-5 h-5 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center text-[10px] focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              aria-label={t('common.close', { defaultValue: 'Close' })}
              tabIndex={0}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 🔧 QA enhancement: Proactive Messages Archive Modal */}
      {showArchive && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            ref={archiveRef}
            className="relative w-full max-w-sm bg-surface-2 border border-glass-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-t-2xl" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-glass-border">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <span>🐘</span>
                {t('buddy.proactiveMessagesArchiveTitle', { defaultValue: "Symy's Messages" })}
              </h3>
              <button
                onClick={() => setShowArchive(false)}
                className="w-6 h-6 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-2.5">
              {messages.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-8">
                  {t('buddy.proactiveMessagesEmpty', { defaultValue: 'No messages yet. Symy will reach out as you spend time together.' })}
                </p>
              ) : (
                [...messages]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(msg => {
                    const text = t(msg.textKey, { defaultValue: msg.textFallback });
                    const emoji = TRIGGER_EMOJI[msg.trigger] || '💬';
                    const timeStr = formatRelativeTime(msg.createdAt, locale);
                    const isUnread = !msg.read && !dismissedIds.has(msg.id);

                    return (
                      <div
                        key={msg.id}
                        // 🔧 2026-07-15 P1-5 fix: 点击单条消息 → 标记已读 (乐观更新 + 后端 API)
                        //   旧代码: 只能通过点 × 按钮逐条关闭, archive modal 里看消息不会标记已读
                        //   → 用户进 archive 看完所有消息, 关闭 archive 后 +N more 数字不变 (NEW 标签也不消失)
                        //   修复: 点击单条消息立即标记已读 (与 × 按钮同样逻辑, 但适配 archive 内的列表项)
                        onClick={() => {
                          if (!isUnread) return;
                          setDismissedIds(prev => new Set(prev).add(msg.id));
                          onMarkRead?.(msg.id);
                          // 后台调 API 标记已读 (不阻塞 archive 浏览)
                          apiFetchVoid('/api/buddy/proactive-messages', {
                            method: 'POST',
                            body: { messageId: msg.id },
                          }).catch(err => {
                            logger.info('[Proactive Message Banner] Failed to mark archive message read (non-blocking):', err);
                          });
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={isUnread ? t('buddy.proactiveMessagesMarkRead') : undefined}
                        className={`p-2.5 rounded-xl border transition-colors cursor-pointer hover:border-cyan-500/40 ${
                          isUnread
                            ? 'bg-cyan-500/8 border-cyan-500/25'
                            : 'bg-glass-fill/50 border-glass-border'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm flex-shrink-0">{emoji}</span>
                          <div className="flex-1 min-w-0">
                            {/* 🔧 message-variety fix: 分类标签 */}
                            <div className="mb-1">
                              <CategoryTag
                                trigger={msg.trigger}
                                isLight={isLight}
                                label={t(CATEGORY_META[TRIGGER_CATEGORY[msg.trigger]].labelKey, {
                                  defaultValue: CATEGORY_META[TRIGGER_CATEGORY[msg.trigger]].labelFallback,
                                })}
                              />
                            </div>
                            <p className="text-[11px] text-text-primary leading-relaxed">{text}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] text-text-tertiary">{timeStr}</span>
                              {isUnread && (
                                <span className="text-[9px] text-cyan-400 font-medium px-1 py-px rounded bg-cyan-500/15">{t('buddy.proactiveMessagesNewBadge')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            {messages.length > 0 && (
              <div className="px-5 py-3 border-t border-glass-border">
                <p className="text-[10px] text-text-tertiary text-center">
                  {t('buddy.proactiveMessagesCount', { defaultValue: '{count} messages', count: totalCount })}
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
