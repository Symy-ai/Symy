import { ApiError } from "@/lib/errors/api-error";
import { getGreenPrefEnabled } from "@/hooks/use-green-pref";
import { getGuardIntensity } from "@/hooks/use-guard-intensity";
import { getGuardScope } from "@/hooks/use-guard-scope";
import { readMicroChallengeHistory } from "@/components/chat/parts/micro-challenge-store";
import { readDismissedContextSignals } from "@/components/chat/parts/context-signal-store";
import { readAskedShoppingSubjects } from "@/components/chat/parts/shopping-clarify-store";
import { consumeGreenAltRetroForRequest } from "@/components/chat/parts/green-alt-retro-store";
import { lastDataQueryMeta } from "../data-query-follow-up";
import type { ChatMessage } from "@/components/chat-bubble";
import type { ActiveChallenge } from "../use-challenge-actions";
import type { ImpulseContext } from "@/types/impulse-context";

interface SendMessageRequestArgs {
  displayContent: string;
  fullApiContent: string;
  userMsg: ChatMessage;
  messages: ChatMessage[];
  activeChallenge: ActiveChallenge | undefined;
  activeChallengeState: ActiveChallenge | undefined;
  overrideChallengeContext?: {
    itemName: string;
    amount: number;
    challengeId?: string;
  };
  impulseContext: ImpulseContext | undefined;
  isDemo: boolean;
  locale: string;
  signal: AbortSignal;
}

export async function requestSendMessage({
  displayContent,
  fullApiContent,
  userMsg,
  messages,
  activeChallenge,
  activeChallengeState,
  overrideChallengeContext,
  impulseContext,
  isDemo,
  locale,
  signal,
}: SendMessageRequestArgs) {
  const apiMessages = [
    ...messages.filter((m) => m.id !== userMsg.id),
    { ...userMsg, content: displayContent },
  ].map((m) => ({
    role: m.role === "action" ? ("user" as const) : m.role,
    content: m.id === userMsg.id ? fullApiContent : m.content,
  }));

  const currentActiveChallenge =
    activeChallenge || activeChallengeState || undefined;
  const chatEndpoint = isDemo ? "/api/chat/anonymous" : "/api/chat";
  const greenAltRetroState = consumeGreenAltRetroForRequest();
  const response = await fetch(chatEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: apiMessages,
      impulseContext: impulseContext || null,
      challengeContext:
        overrideChallengeContext ||
        (currentActiveChallenge ? currentActiveChallenge : null) ||
        null,
      stream: true,
      locale,
      greenPref: getGreenPrefEnabled() ? "on" : "off",
      guardIntensity: getGuardIntensity(),
      guardScope: getGuardScope(),
      microChallengeHistory: readMicroChallengeHistory(),
      dataQueryContext: lastDataQueryMeta(messages),
      dismissedContextSignals: readDismissedContextSignals(),
      askedShoppingSubjects: readAskedShoppingSubjects(),
      afterGuardCard: (() => {
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant");
        return !!(
          lastAssistant &&
          (lastAssistant.greenAlt ||
            lastAssistant.reuseHint ||
            lastAssistant.microChallenge)
        );
      })(),
      pendingGreenAltRetro: greenAltRetroState?.pending ?? undefined,
      greenAltRetroAnswer: greenAltRetroState?.answer ?? undefined,
    }),
    signal,
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new ApiError(
      `Chat API error (${response.status}): ${errorText.substring(0, 200)}`,
      response.status,
    );
  }

  return {
    response,
    currentActiveChallenge,
  };
}
