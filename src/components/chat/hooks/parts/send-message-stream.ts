import { ChatMessage } from "@/components/chat-bubble";
import { markGreenAltRetroAwaited } from "@/components/chat/parts/green-alt-retro-store";
import {
  consumeAIStream,
  handleToolEvent,
  type ConsumeAIStreamCallbacks,
} from "../consume-ai-stream";
import { applyDriftGuard, DRIFT_REPLACEMENTS } from "@/lib/chat-drift-guard";
import type { ProductCardData } from "@/types/product-card";
import type { GreenAltCardData } from "@/types/green-alt-card";
import type { GreenAltRetroCardData } from "@/types/green-alt-retro";
import type { ActiveChallenge } from "../use-challenge-actions";
import type { UseChatActionsParams } from "../use-chat-actions-types";

type I18nT = UseChatActionsParams["i18n"]["t"];

interface SendMessageStreamArgs {
  response: Response;
  content: string;
  msgMode: "challenge" | "normal";
  activeChallenge: ActiveChallenge | undefined;
  currentActiveChallenge: ActiveChallenge | undefined;
  locale: string;
  t: I18nT;
  nextId: (prefix: string) => string;
  onAssistantMsgId: (id: string) => void;
  saveMessage: (msg: ChatMessage) => void;
  setMessagesSync: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  sendMessageLockRef: React.MutableRefObject<{
    inProgress: boolean;
    lastContent: string;
    lastTime: number;
  }>;
  retryAiResponseRef: React.MutableRefObject<
    ((content: string) => Promise<void>) | null
  >;
  justCompletedChallengeRef: React.MutableRefObject<boolean>;
  justBoughtChallengeRef: React.MutableRefObject<boolean>;
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  onBuddyStateRefresh?: () => void;
  onToast?: (message: string, type?: "success" | "info") => void;
  addMcpNotification: (
    message: string,
    type: "reward" | "penalty" | "badge",
  ) => void;
  onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
  onChallengeBought?: (amount: number, itemName: string) => void;
}

export async function consumeSendMessageStream({
  response,
  content,
  msgMode,
  activeChallenge,
  currentActiveChallenge,
  locale,
  t,
  nextId,
  onAssistantMsgId,
  saveMessage,
  setMessagesSync,
  messagesRef,
  sendMessageLockRef,
  retryAiResponseRef,
  justCompletedChallengeRef,
  justBoughtChallengeRef,
  setActiveChallenge,
  onBuddyStateRefresh,
  onToast,
  addMcpNotification,
  onChallengeCompleted,
  onChallengeBought,
}: SendMessageStreamArgs): Promise<string | null> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let accumulatedReply = "";
  let accumulatedReasoning = "";
  const currentAssistantMsgId = nextId("ai");
  onAssistantMsgId(currentAssistantMsgId);
  const turnId = currentAssistantMsgId;
  let streamingRafId = 0;
  let pendingStreamUpdate = false;
  let sseErrorDisplayed = false;
  let idleFallbackDisplayed = false;
  let readerInterrupted = false;
  let productCards: ProductCardData[] = [];
  let greenAltCard: GreenAltCardData | undefined;
  let greenAltRetroCard: GreenAltRetroCardData | undefined;
  let reuseHint: ChatMessage["reuseHint"];
  let microChallenge: ChatMessage["microChallenge"];
  let greenKnowledge: ChatMessage["greenKnowledge"];
  let cooldownCard: ChatMessage["cooldownCard"];
  let prepurchaseCard: ChatMessage["prepurchaseCard"];
  let duplicatePrecheckCard: ChatMessage["duplicatePrecheckCard"];
  let commitmentCard: ChatMessage["commitmentCard"];
  let compareCard: ChatMessage["compareCard"];
  let altFootprint: ChatMessage["altFootprint"];
  let listTriageCard: ChatMessage["listTriageCard"];
  let savingsQueryCard: ChatMessage["savingsQueryCard"];
  let categoryQueryCard: ChatMessage["categoryQueryCard"];
  let impulseTimeCard: ChatMessage["impulseTimeCard"];
  let impulseForecastCard: ChatMessage["impulseForecastCard"];
  let guardPulseCard: ChatMessage["guardPulseCard"];
  let emotionGuardCard: ChatMessage["emotionGuardCard"];
  let contextSignal: ChatMessage["contextSignal"];
  let contextTrust: ChatMessage["contextTrust"];
  let shoppingClarifyCard: ChatMessage["shoppingClarifyCard"];

  const flushStreamUpdate = () => {
    pendingStreamUpdate = false;
    streamingRafId = 0;
    setMessagesSync((prev) => {
      const exists = prev.some((m) => m.id === currentAssistantMsgId);
      if (!exists) {
        return [
          ...prev,
          {
            id: currentAssistantMsgId,
            role: "assistant" as const,
            content: accumulatedReply,
            reasoning: accumulatedReasoning || undefined,
            timestamp: new Date(),
            mode: msgMode,
          },
        ];
      }
      return prev.map((m) =>
        m.id === currentAssistantMsgId
          ? {
              ...m,
              content: accumulatedReply,
              reasoning: accumulatedReasoning || m.reasoning,
            }
          : m,
      );
    });
  };
  const scheduleStreamUpdate = () => {
    if (!pendingStreamUpdate) {
      pendingStreamUpdate = true;
      streamingRafId = requestAnimationFrame(flushStreamUpdate);
    }
  };

  const assistantMsg: ChatMessage = {
    id: currentAssistantMsgId,
    role: "assistant",
    content: "",
    reasoning: undefined,
    timestamp: new Date(),
    mode: msgMode,
  };
  setMessagesSync((prev) => {
    if (prev.some((m) => m.id === currentAssistantMsgId)) return prev;
    return [...prev, assistantMsg];
  });

  if (reader) {
    try {
      const streamResult = await consumeAIStream(reader, decoder, {
        onToken: (_token, accReply) => {
          accumulatedReply = accReply;
          scheduleStreamUpdate();
        },
        onReasoning: (_token, accReasoning) => {
          accumulatedReasoning = accReasoning;
          scheduleStreamUpdate();
        },
        onToolResult: (parsed) =>
          handleToolEvent(parsed, {
            activeChallenge,
            t,
            locale,
            setActiveChallenge,
            onBuddyStateRefresh,
            onToast,
            addMcpNotification,
            justCompletedChallengeRef,
            onChallengeCompleted,
            onChallengeBought,
            justBoughtChallengeRef,
          }),
        onProductCards: (cards) => {
          productCards = cards;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, productCards: cards, productCardsQuery: content }
                : m,
            ),
          );
        },
        onGreenAlt: (data) => {
          greenAltCard = data;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, greenAlt: data } : m,
            ),
          );
        },
        onGreenAltRetro: (data) => {
          greenAltRetroCard = data;
          markGreenAltRetroAwaited(data.entryId);
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, greenAltRetro: data }
                : m,
            ),
          );
        },
        onReuseHint: (hint) => {
          reuseHint = hint;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, reuseHint: hint } : m,
            ),
          );
        },
        onMicroChallenge: (proposal) => {
          if (currentActiveChallenge) return;
          microChallenge = proposal;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, microChallenge: proposal }
                : m,
            ),
          );
        },
        onGreenKnowledge: (data) => {
          greenKnowledge = data;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, greenKnowledge: data }
                : m,
            ),
          );
        },
        onCooldownCard: (card) => {
          cooldownCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, cooldownCard: card } : m,
            ),
          );
        },
        onPrepurchaseCard: (card) => {
          prepurchaseCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, prepurchaseCard: card }
                : m,
            ),
          );
        },
        onDuplicatePrecheckCard: (card) => {
          duplicatePrecheckCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, duplicatePrecheckCard: card }
                : m,
            ),
          );
        },
        onCommitmentCard: (card) => {
          commitmentCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, commitmentCard: card }
                : m,
            ),
          );
        },
        onCompareCard: (card) => {
          compareCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, compareCard: card } : m,
            ),
          );
        },
        onAltFootprint: (card) => {
          altFootprint = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, altFootprint: card } : m,
            ),
          );
        },
        onListTriageCard: (card) => {
          listTriageCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, listTriageCard: card }
                : m,
            ),
          );
        },
        onSavingsQueryCard: (card) => {
          savingsQueryCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, savingsQueryCard: card }
                : m,
            ),
          );
        },
        onCategoryQueryCard: (card) => {
          categoryQueryCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, categoryQueryCard: card }
                : m,
            ),
          );
        },
        onImpulseTimeCard: (card) => {
          impulseTimeCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, impulseTimeCard: card }
                : m,
            ),
          );
        },
        onImpulseForecastCard: (card) => {
          impulseForecastCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, impulseForecastCard: card }
                : m,
            ),
          );
        },
        onGuardPulseCard: (card) => {
          guardPulseCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, guardPulseCard: card }
                : m,
            ),
          );
        },
        onEmotionGuardCard: (card) => {
          emotionGuardCard = card;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, emotionGuardCard: card }
                : m,
            ),
          );
        },
        onContextSignal: (data) => {
          contextSignal = data;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, contextSignal: data }
                : m,
            ),
          );
        },
        onContextTrust: (data) => {
          contextTrust = data;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, contextTrust: data } : m,
            ),
          );
        },
        onShoppingClarify: (data) => {
          shoppingClarifyCard = data;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, shoppingClarifyCard: data }
                : m,
            ),
          );
        },
        onError: (rawContent) => {
          const errorContent =
            rawContent || t("chat.aiFallback.connectionInterrupted");
          sseErrorDisplayed = true;
          if (streamingRafId) {
            cancelAnimationFrame(streamingRafId);
            streamingRafId = 0;
          }
          pendingStreamUpdate = false;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? {
                    ...m,
                    content: errorContent,
                    isError: true,
                    onRetry: () => {
                      setMessagesSync((prev2) =>
                        prev2.filter((m2) => m2.id !== currentAssistantMsgId),
                      );
                      const lastUserMsg = messagesRef.current
                        .filter((m2) => m2.role === "user")
                        .pop();
                      if (lastUserMsg) {
                        sendMessageLockRef.current.inProgress = false;
                        setTimeout(() => {
                          retryAiResponseRef.current?.(lastUserMsg.content);
                        }, 0);
                      }
                    },
                  }
                : m,
            ),
          );
          return true;
        },
        onRemainingBufferToken: (_token, accReply) => {
          accumulatedReply = accReply;
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, content: accumulatedReply }
                : m,
            ),
          );
        },
      } satisfies ConsumeAIStreamCallbacks);
      accumulatedReply = streamResult.reply;
      accumulatedReasoning = streamResult.reasoning;
      if (streamResult.errorDisplayed) return null;
      if (streamResult.readerError) {
        readerInterrupted = true;
        setMessagesSync((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgId
              ? {
                  ...m,
                  content: accumulatedReply,
                  isError: true,
                  onRetry: () => {
                    if (sendMessageLockRef.current.inProgress) return;
                    setMessagesSync((prev2) =>
                      prev2.filter((m2) => m2.id !== currentAssistantMsgId),
                    );
                    setTimeout(() => {
                      retryAiResponseRef.current?.(content);
                    }, 0);
                  },
                }
              : m,
          ),
        );
        return null;
      }
      if (streamResult.idleTimeout && !accumulatedReply.trim()) {
        idleFallbackDisplayed = true;
        setMessagesSync((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgId
              ? {
                  ...m,
                  content: t("chat.aiFallback.streamInterrupted"),
                  isError: true,
                  onRetry: () => {
                    setMessagesSync((prev2) =>
                      prev2.filter((m2) => m2.id !== currentAssistantMsgId),
                    );
                    const lastUserMsg = messagesRef.current
                      .filter((m2) => m2.role === "user")
                      .pop();
                    if (lastUserMsg) {
                      sendMessageLockRef.current.inProgress = false;
                      setTimeout(() => {
                        if (retryAiResponseRef.current) {
                          retryAiResponseRef.current(lastUserMsg.content);
                        }
                      }, 0);
                    }
                  },
                }
              : m,
          ),
        );
        return null;
      }
    } finally {
      if (streamingRafId) cancelAnimationFrame(streamingRafId);
      if (!sseErrorDisplayed && !idleFallbackDisplayed && !readerInterrupted) {
        flushStreamUpdate();
      }
    }
  }

  if (!accumulatedReply.trim()) {
    setMessagesSync((prev) =>
      prev.map((m) =>
        m.id === currentAssistantMsgId
          ? { ...m, content: t("chat.aiFallback.hereForYou") }
          : m,
      ),
    );
  }

  const HIGH_CONFIDENCE_LEAK_PATTERNS = [
    /\bcomplete_challenge\b|\badd_dream_fund_progress\b|\brecord_impulse\b/i,
    /\bIF THE USER\b|\bYou MUST\b|\bimpulse scoring guide\b/i,
  ];
  const isHighConfidenceLeak =
    accumulatedReply.length > 20 &&
    HIGH_CONFIDENCE_LEAK_PATTERNS.some((p) => p.test(accumulatedReply));

  const rawFinalContent = isHighConfidenceLeak
    ? t("chat.aiFallback.hereForYou")
    : accumulatedReply.trim() || t("chat.aiFallback.hereForYou");

  const detectedDrift = applyDriftGuard(rawFinalContent, turnId);
  const finalContent = detectedDrift
    ? (DRIFT_REPLACEMENTS[detectedDrift] ?? rawFinalContent)
    : rawFinalContent;

  const finalMsg: ChatMessage = {
    id: currentAssistantMsgId,
    role: "assistant",
    content: finalContent,
    reasoning: undefined,
    timestamp: new Date(),
    mode: msgMode,
    productCards: productCards.length ? productCards : undefined,
    productCardsQuery: productCards.length ? content : undefined,
    greenAlt: greenAltCard,
    greenAltRetro: greenAltRetroCard,
    reuseHint,
    microChallenge,
    greenKnowledge,
    cooldownCard,
    prepurchaseCard,
    duplicatePrecheckCard,
    commitmentCard,
    compareCard,
    altFootprint,
    listTriageCard,
    savingsQueryCard,
    categoryQueryCard,
    impulseTimeCard,
    impulseForecastCard,
    guardPulseCard,
    emotionGuardCard,
    contextSignal,
    contextTrust,
    shoppingClarifyCard,
  };
  saveMessage(finalMsg);
  return currentAssistantMsgId;
}
