/**
 * 🐘 batch61-b 购物场景弱信号短路块（b137 拆解第十七刀，自 route.ts 纯机械搬移）
 *
 * 生活语言里的消费决策 ("想奖励自己 / 最后三单 / 快坏了"), 无标准购物关键词时
 * 既有强 detector 全部漏接 → 弱信号词表命中后按语义路由到既有能力
 * (情绪→60-c 情绪卡 / 促销→48-b 冷静卡 / 耗损→50-a 三问 + 绿色替代),
 * canned 短路不调 Letta。已纠正的信号词条 (会话级) 本轮不参与匹配;
 * greenPref 'off' 视为拒绝守护, 整体静默。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ContextSignalBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  greenPref?: 'on' | 'off';
  suppressGuardCards: boolean;
  dismissedContextSignals: string[] | null | undefined;
  guardIntensity: string | undefined;
  factsStore: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryContextSignalBlock(input: ContextSignalBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, greenPref, suppressGuardCards, dismissedContextSignals, guardIntensity, factsStore, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  if (greenPref === 'off' || suppressGuardCards) return null;
  const { buildContextSignalTurn, buildContextSignalSseStream } = await import('../context-signal-turn');
  type EvidenceStore = import('../context-trust-evidence').EvidenceStore;
  let trustFacts;
  let trustHistory;
  let trustCorrection;
  if (userId && factsStore) {
    const [{ loadShoppingFacts }, { loadContextTrustEvidence }] = await Promise.all([
      import('@/lib/shopping-facts'),
      import('../context-trust-evidence'),
    ]);
    const [loaded, evidence] = await Promise.all([
      loadShoppingFacts(userId, factsStore as Parameters<typeof loadShoppingFacts>[1]),
      loadContextTrustEvidence(userId, factsStore as unknown as EvidenceStore).catch(() => ({ history: [], correction: null })),
    ]);
    trustFacts = loaded.facts.slice(0, 3);
    trustHistory = evidence.history;
    trustCorrection = evidence.correction;
  }
  const contextSignalTurn = buildContextSignalTurn({
    userContent,
    locale,
    guardIntensity,
    greenPref,
    dismissedEntryIds: dismissedContextSignals ?? undefined,
    facts: trustFacts,
    history: trustHistory,
    correction: trustCorrection,
  });
  if (!contextSignalTurn) return null;
  const dismissed = dismissedContextSignals ?? [];
  const correctedTrustSignals = new Set(
    trustCorrection?.topic
      ? [...dismissed, trustCorrection.topic]
      : dismissed,
  );
  if (contextSignalTurn.contextSignal.words.every((word) => correctedTrustSignals.has(word.id))) {
    contextSignalTurn.contextTrust = undefined;
  }
  logger.info('[Chat API] Shopping context signal detected, returning context signal turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildContextSignalSseStream(contextSignalTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: contextSignalTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      contextSignal: contextSignalTurn.contextSignal,
      contextTrust: contextSignalTurn.contextTrust,
      ...(contextSignalTurn.emotionGuardCard ? { emotionGuardCard: contextSignalTurn.emotionGuardCard } : {}),
      ...(contextSignalTurn.cooldownCard ? { cooldownCard: contextSignalTurn.cooldownCard } : {}),
      ...(contextSignalTurn.prepurchaseCard ? { prepurchaseCard: contextSignalTurn.prepurchaseCard } : {}),
    }),
  );
}
