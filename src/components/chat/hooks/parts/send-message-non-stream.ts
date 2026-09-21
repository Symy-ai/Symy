import { ChatMessage } from "@/components/chat-bubble";
import { markGreenAltRetroAwaited } from "@/components/chat/parts/green-alt-retro-store";
import { applyDriftGuard, DRIFT_REPLACEMENTS } from "@/lib/chat-drift-guard";
import { extractProductCards } from "@/lib/product-tool-result";
import type { ProductCardData } from "@/types/product-card";
import type { ActiveChallenge } from "../use-challenge-actions";
import type { McpToolResult } from "../use-mcp-notifications";
import type { UseChatActionsParams } from "../use-chat-actions-types";

type I18nT = UseChatActionsParams["i18n"]["t"];
type ToolCall = {
  name: string;
  result?: string;
  args?: Record<string, unknown>;
};

interface SendMessageNonStreamArgs {
  response: Response;
  content: string;
  msgMode: "challenge" | "normal";
  currentActiveChallenge: ActiveChallenge | undefined;
  t: I18nT;
  nextId: (prefix: string) => string;
  saveMessage: (msg: ChatMessage) => void;
  setMessagesSync: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  handleMCPResults: (results: McpToolResult[]) => void;
  addMcpNotification: (
    message: string,
    type: "reward" | "penalty" | "badge",
  ) => void;
  activeChallengeRef: React.MutableRefObject<ActiveChallenge | undefined>;
  buddyStateRefreshTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  justCompletedChallengeRef: React.MutableRefObject<boolean>;
  justBoughtChallengeRef: React.MutableRefObject<boolean>;
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  onBuddyStateRefresh?: () => void;
  onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
  onChallengeBought?: (amount: number, itemName: string) => void;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : undefined;

export async function processSendMessageNonStream({
  response,
  content,
  msgMode,
  currentActiveChallenge,
  t,
  nextId,
  saveMessage,
  setMessagesSync,
  handleMCPResults,
  addMcpNotification,
  activeChallengeRef,
  buddyStateRefreshTimerRef,
  justCompletedChallengeRef,
  justBoughtChallengeRef,
  setActiveChallenge,
  onBuddyStateRefresh,
  onChallengeCompleted,
  onChallengeBought,
}: SendMessageNonStreamArgs) {
  const data = await response.json();
  const replyContent = data.reply || t("chat.aiFallback.hereForYou");

  const nonStreamTurnId = nextId("ai");
  const detectedDrift = applyDriftGuard(replyContent, nonStreamTurnId);
  const finalContent = detectedDrift
    ? (DRIFT_REPLACEMENTS[detectedDrift] ?? replyContent)
    : replyContent;

  const assistantMsg: ChatMessage = {
    id: nonStreamTurnId,
    role: "assistant",
    content: finalContent,
    reasoning: data.reasoning || undefined,
    timestamp: new Date(),
    mode: msgMode,
  };
  const nonStreamCards: ProductCardData[] = (data.toolCalls || []).flatMap(
    (toolCall: ToolCall) => extractProductCards(toolCall.name, toolCall.result),
  );
  if (nonStreamCards.length) {
    assistantMsg.productCards = nonStreamCards;
    assistantMsg.productCardsQuery = content;
  }
  if (data.greenAlt) assistantMsg.greenAlt = data.greenAlt;
  if (data.greenAltRetro) {
    assistantMsg.greenAltRetro = data.greenAltRetro;
    markGreenAltRetroAwaited(data.greenAltRetro.entryId);
  }
  if (data.reuseHint) assistantMsg.reuseHint = data.reuseHint;
  if (data.microChallenge && !currentActiveChallenge)
    assistantMsg.microChallenge = data.microChallenge;
  if (data.greenKnowledge) assistantMsg.greenKnowledge = data.greenKnowledge;
  if (data.cooldownCard) assistantMsg.cooldownCard = data.cooldownCard;
  if (data.prepurchaseCard) assistantMsg.prepurchaseCard = data.prepurchaseCard;
  if (data.duplicatePrecheckCard)
    assistantMsg.duplicatePrecheckCard = data.duplicatePrecheckCard;
  if (data.commitmentCard) assistantMsg.commitmentCard = data.commitmentCard;
  if (data.compareCard) assistantMsg.compareCard = data.compareCard;
  if (data.altFootprint) assistantMsg.altFootprint = data.altFootprint;
  if (data.listTriageCard) assistantMsg.listTriageCard = data.listTriageCard;
  if (data.savingsQueryCard)
    assistantMsg.savingsQueryCard = data.savingsQueryCard;
  if (data.categoryQueryCard)
    assistantMsg.categoryQueryCard = data.categoryQueryCard;
  if (data.impulseTimeCard) assistantMsg.impulseTimeCard = data.impulseTimeCard;
  if (data.impulseForecastCard)
    assistantMsg.impulseForecastCard = data.impulseForecastCard;
  if (data.guardPulseCard) assistantMsg.guardPulseCard = data.guardPulseCard;
  if (data.emotionGuardCard)
    assistantMsg.emotionGuardCard = data.emotionGuardCard;
  if (data.contextSignal) assistantMsg.contextSignal = data.contextSignal;
  if (data.contextTrust) assistantMsg.contextTrust = data.contextTrust;

  setMessagesSync((prev) => {
    if (prev.some((m) => m.id === assistantMsg.id)) return prev;
    return [...prev, assistantMsg];
  });
  saveMessage(assistantMsg);

  if (data.toolResults && Array.isArray(data.toolResults)) {
    handleMCPResults(data.toolResults);
  }

  if (
    data.toolCalls &&
    Array.isArray(data.toolCalls) &&
    data.toolCalls.length > 0
  ) {
    for (const tc of data.toolCalls) {
      const toolName = tc.name || "";
      const notifType: "reward" | "penalty" | "badge" =
        toolName === "record_impulse"
          ? "penalty"
          : toolName === "add_badge"
            ? "badge"
            : "reward";

      let notifMessage = "";
      switch (toolName) {
        case "record_impulse": {
          const amount = num(tc.args?.amount);
          notifMessage = amount
            ? t("chat.mcpNotifications.impulseRecordedWithAmount", { amount })
            : t("chat.mcpNotifications.impulseRecorded");
          break;
        }
        case "complete_challenge": {
          const savedAmount = num(tc.args?.saved_amount);
          notifMessage = savedAmount
            ? t("chat.mcpNotifications.challengeCompletedSaved", {
                amount: savedAmount,
              })
            : t("chat.mcpNotifications.challengeCompleted");
          justCompletedChallengeRef.current = true;
          setActiveChallenge(undefined);
          const depositChallengeId = tc.args?.challenge_id;
          const depositSavedAmount = activeChallengeRef.current?.amount;
          const isBuyPath = justBoughtChallengeRef.current;
          if (
            !isBuyPath &&
            depositChallengeId &&
            depositSavedAmount &&
            depositSavedAmount > 0
          ) {
            onChallengeCompleted?.(depositChallengeId, depositSavedAmount);
          }
          if (isBuyPath && depositSavedAmount && depositSavedAmount > 0) {
            onChallengeBought?.(
              depositSavedAmount,
              activeChallengeRef.current?.itemName || "",
            );
          }
          break;
        }
        case "add_tokens": {
          const tokenAmount = num(tc.args?.amount);
          notifMessage = tokenAmount
            ? t("chat.mcpNotifications.tokensEarnedAmount", {
                amount: tokenAmount,
              })
            : t("chat.mcpNotifications.tokensEarned");
          break;
        }
        case "add_badge": {
          const badgeId = tc.args?.badge_id;
          notifMessage = t("chat.mcpNotifications.badgeUnlockedName", {
            name: badgeId || "Achievement",
          });
          break;
        }
        case "add_dream_fund_progress": {
          const fundAmount = num(tc.args?.amount);
          notifMessage = fundAmount
            ? t("chat.mcpNotifications.dreamFundAdded", { amount: fundAmount })
            : t("chat.mcpNotifications.dreamFundProgress");
          break;
        }
        case "add_vitality": {
          const vitalityChange = num(tc.args?.amount);
          notifMessage = vitalityChange
            ? t("chat.mcpNotifications.vitalityChange", {
                change: `${vitalityChange > 0 ? "+" : ""}${vitalityChange}`,
              })
            : t("chat.mcpNotifications.vitalityAdjusted");
          break;
        }
        default:
          notifMessage = t("chat.mcpNotifications.toolUsed", { toolName });
      }

      if (notifMessage) {
        addMcpNotification(notifMessage, notifType);
      }
    }

    if (onBuddyStateRefresh) {
      if (buddyStateRefreshTimerRef.current)
        clearTimeout(buddyStateRefreshTimerRef.current);
      buddyStateRefreshTimerRef.current = setTimeout(() => {
        buddyStateRefreshTimerRef.current = null;
        onBuddyStateRefresh();
      }, 3000);
    }
  }
  return nonStreamTurnId;
}
