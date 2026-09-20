/**
 * useMcpNotifications — MCP 工具调用通知管理
 *
 * 从 chat-tab.tsx 提取 (架构还债: chat-tab 上帝组件拆分)
 *
 * 职责:
 * - 管理 MCP 通知列表 (mcpNotifications state)
 * - 跟踪通知 timer (5s 后自动移除, 卸载时清理)
 * - 解析 MCP 工具结果, 生成用户可见的通知消息
 * - 调用 onBuddyStateRefresh 刷新 buddy state
 *
 * 依赖:
 * - nextId: 生成唯一通知 ID
 * - t: i18n 翻译函数
 * - onChallengeClear: complete_challenge 时清除挑战 banner
 * - onBuddyStateRefresh: 工具执行后刷新 buddy state
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): McpNotification 单一 source of truth
import type { McpNotification } from '@/types/mcp-notification';
export type { McpNotification };
// 🏅 拦截勋章 (绿色转向): complete_challenge passed → Buddy 页通知区域「晒出这枚勋章」
import { dispatchInterceptMedal } from '@/lib/intercept-medal';

export interface McpToolResult {
  name: string;
  success: boolean;
  message: string;
  result?: Record<string, unknown>;
}

export interface UseMcpNotificationsOptions {
  nextId: (prefix: string) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onChallengeClear?: () => void;
  onBuddyStateRefresh?: () => void;
  // 🔧 信任存入 fix (Round 106): 挑战完成回调, 弹出 DepositDialog
  onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
}

export function useMcpNotifications({
  nextId,
  t,
  onChallengeClear,
  onBuddyStateRefresh,
  onChallengeCompleted,
}: UseMcpNotificationsOptions) {
  const [mcpNotifications, setMcpNotifications] = useState<McpNotification[]>([]);
  const mcpNotifTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 清理所有 timer on unmount (BUG-180 fix)
  useEffect(() => {
    return () => {
      mcpNotifTimersRef.current.forEach(clearTimeout);
      mcpNotifTimersRef.current = [];
    };
  }, []);

  const handleMCPResults = useCallback((results: McpToolResult[]) => {
    if (!results || results.length === 0) return;

    const notifications: McpNotification[] = [];

    for (const r of results) {
      // 🔧 ARCH fix (Round 40 MEDIUM-5 — MCP 工具失败静默 skip, 用户无感知):
      //    旧代码: if (!r.success) continue — AI 文字说"我给你加了 5 个 tokens！"但工具失败时
      //    用户**没有任何通知、没有 tokens 实际到账**, 且无失败提示。
      //    根因修复: 失败时 push 一个 'penalty' 类型的失败通知, 让用户知道 AI 尝试了但失败了。
      if (!r.success) {
        notifications.push({
          id: nextId('mcp'),
          message: t('chat.mcpNotifications.toolFailed', {
            tool: r.name,
            defaultValue: `Tool '${r.name}' failed: ${r.message || 'unknown error'}`,
          }),
          type: 'penalty',
        });
        continue;
      }

      // 🔧 ARCH fix (Round 41 MEDIUM-3 — auditLogged=false 时显示次要 toast 提示 Health Log 缺记录)
      const auditLogged = r.result?.auditLogged !== false; // default true if undefined
      if (!auditLogged) {
        notifications.push({
          id: nextId('mcp-audit'),
          message: t('chat.mcpNotifications.auditLogDelayed', {
            defaultValue: 'Reward applied, but Health Log may be delayed — refresh later to see full record.',
          }),
          type: 'penalty',
        });
      }

      switch (r.name) {
        case 'add_tokens': {
          // BUG-184 fix: 添加默认值，防止 undefined 显示在 UI
          const amount = (r.result?.tokensAdded as number) || 0;
          const vitalityBoost = (r.result?.vitalityBoost as number) || 0;
          notifications.push({
            id: nextId('mcp'),
            message: t('chat.mcpNotifications.tokensAndVitality', { tokens: amount, vitality: vitalityBoost }),
            type: 'reward',
          });
          break;
        }
        case 'complete_challenge': {
          const tokenReward = r.result?.tokenReward as number;
          const savedAmount = r.result?.savedAmount as number;
          const badgeAwarded = r.result?.badgeAwarded as string | null;
          const challengeId = r.result?.challengeId as string | undefined;
          // 🔧 需求七: 邀请奖励 toast (referee 完成第一次挑战后)
          const inviteRewardToast = r.result?.inviteRewardToast as string | null;
          notifications.push({
            id: nextId('mcp'),
            message: badgeAwarded
              ? t('chat.mcpNotifications.challengeCompleteWithBadge', { tokens: tokenReward || 0, amount: savedAmount || 0, badge: badgeAwarded })
              : t('chat.mcpNotifications.challengeCompleteNoBadge', { tokens: tokenReward || 0, amount: savedAmount || 0 }),
            type: badgeAwarded ? 'badge' : 'reward',
          });
          // 🔧 需求七: 邀请奖励 — 额外通知 "你的看见，点亮了另一个人"
          if (inviteRewardToast) {
            notifications.push({
              id: nextId('mcp-invite'),
              message: t(inviteRewardToast),
              type: 'badge',
            });
          }
          // 🔧 BUG-4 fix: Clear challenge banner on completion
          onChallengeClear?.();
          // 🔧 信任存入 fix (Round 106): 通知前端弹出 DepositDialog
          //   流式路径 (toolResults) — challengeId 从 MCP handler result 中获取
          if (challengeId && savedAmount && savedAmount > 0) {
            onChallengeCompleted?.(challengeId, savedAmount);
          }
          // 🏅 拦截勋章 (绿色转向): status 非 'failed' 且 savedAmount>0 = 用户没买 = 可晒的勋章。
          //    failed 路径 (buildFailedReturn) 也带 savedAmount+itemName, 必须排除;
          //    alreadyCompleted 是 AI 重试的重复结算, 不重复发勋章。
          //    record_impulse 是"买了" (impulse_damage), 不是拦截 — 天然不进此分支。
          const medalStatus = r.result?.status as string | undefined;
          if (savedAmount && savedAmount > 0 && medalStatus !== 'failed' && r.result?.alreadyCompleted !== true) {
            dispatchInterceptMedal({
              itemTitle: (r.result?.itemName as string) || '',
              savedCents: Math.round(savedAmount * 100),
              date: new Date().toISOString(),
            });
          }
          break;
        }
        case 'add_badge': {
          const badgeName = (r.result?.badgeName as string) || 'Achievement';
          notifications.push({
            id: nextId('mcp'),
            message: t('chat.mcpNotifications.badgeUnlockedName', { name: badgeName }),
            type: 'badge',
          });
          break;
        }
        case 'add_dream_fund_progress': {
          const fundName = (r.result?.fundName as string) || 'Dream Fund';
          const progress = (r.result?.progress as number) || 0;
          notifications.push({
            id: nextId('mcp'),
            message: t('chat.mcpNotifications.fundProgress', { fundName, progress }),
            type: 'reward',
          });
          break;
        }
        case 'record_impulse': {
          const vitalityPenalty = (r.result?.vitalityPenalty as number) || 0;
          notifications.push({
            id: nextId('mcp'),
            message: t('chat.mcpNotifications.symyVitality', { penalty: vitalityPenalty }),
            type: 'penalty',
          });
          break;
        }
        case 'add_vitality': {
          const change = (r.result?.vitalityChange as number) || 0;
          notifications.push({
            id: nextId('mcp'),
            message: t('chat.mcpNotifications.vitalityChange', { change: `${change > 0 ? '+' : ''}${change}` }),
            type: change > 0 ? 'reward' : 'penalty',
          });
          break;
        }
      }
    }

    if (notifications.length > 0) {
      setMcpNotifications((prev) => [...prev, ...notifications]);
      // BUG-180 fix: 跟踪 timer，组件卸载时清理
      // 🔧 ARCH fix (Round 15 audit M6 — timer 数组无限增长):
      //    旧代码 push tid 但从不在 timer 触发后移除 → 长聊天 session 内存线性增长。
      //    根因修复: timer 回调中从 ref 数组移除自己 (与 buddy-tab pulseTimerRefs 模式一致)。
      const tid = setTimeout(() => {
        mcpNotifTimersRef.current = mcpNotifTimersRef.current.filter(t => t !== tid);
        setMcpNotifications((prev) =>
          prev.filter((n) => !notifications.some((nn) => nn.id === n.id))
        );
      }, 5000);
      mcpNotifTimersRef.current.push(tid);
    }

    if (onBuddyStateRefresh) {
      onBuddyStateRefresh();
    }
  // 🔧 ARCH fix (Round 33 AUDIT-7 MEDIUM-6): 添加 onChallengeCompleted 到 deps
  //    旧代码遗漏 → stale closure → onChallengePassed 可能不触发
  }, [nextId, t, onChallengeClear, onBuddyStateRefresh, onChallengeCompleted]);

  // 🔧 架构还债: 暴露 addMcpNotification 供 chat-tab 内联 SSE 流调用
  const addMcpNotification = useCallback((message: string, type: 'reward' | 'penalty' | 'badge') => {
    const notifId = nextId('mcp-inline');
    setMcpNotifications((prev) => [...prev, { id: notifId, message, type }]);
    // 🔧 Round 15 audit M6: timer 回调中移除自己
    const tid = setTimeout(() => {
      mcpNotifTimersRef.current = mcpNotifTimersRef.current.filter(t => t !== tid);
      setMcpNotifications((prev) => prev.filter((n) => n.id !== notifId));
    }, 5000);
    mcpNotifTimersRef.current.push(tid);
  }, [nextId]);

  return {
    mcpNotifications,
    handleMCPResults,
    addMcpNotification,
  };
}
