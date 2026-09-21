import { ChatMessage } from "@/components/chat-bubble";
import { getErrorStatus } from "@/lib/errors/api-error";
import { logger } from "@/lib/logger";
import type { UseChatActionsParams } from "../use-chat-actions-types";

type I18nT = UseChatActionsParams["i18n"]["t"];

interface SendMessageErrorArgs {
  err: unknown;
  assistantMsgId: string | null;
  t: I18nT;
  nextId: (prefix: string) => string;
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
}

export function handleSendMessageError({
  err,
  assistantMsgId,
  t,
  nextId,
  setMessagesSync,
  messagesRef,
  sendMessageLockRef,
  retryAiResponseRef,
}: SendMessageErrorArgs) {
  if (err instanceof DOMException && err.name === "AbortError") {
    if (assistantMsgId) {
      setMessagesSync((prev) => prev.filter((m) => m.id !== assistantMsgId));
    }
    return;
  }

  const errorStatus = getErrorStatus(err);
  const isAuthError = errorStatus === 401;
  const errorMsgId = nextId("ai");
  const errorMsg: ChatMessage = {
    id: errorMsgId,
    role: "assistant",
    content: isAuthError
      ? t("chat.aiFallback.authRequired", {
          defaultValue:
            "Sign in to chat with Symy and save your conversations.",
        })
      : t("chat.aiFallback.aiError", {
          defaultValue:
            "AI is temporarily unavailable. This might be due to high traffic or a timeout. Please try again.",
        }),
    timestamp: new Date(),
    isError: true,
    onRetry: () => {
      setMessagesSync((prev) => prev.filter((m) => m.id !== errorMsgId));
      const lastUserMsg = messagesRef.current
        .filter((m) => m.role === "user")
        .pop();
      if (lastUserMsg) {
        sendMessageLockRef.current.inProgress = false;
        setTimeout(() => {
          if (retryAiResponseRef.current) {
            retryAiResponseRef.current(lastUserMsg.content);
          } else {
            logger.warn(
              "[ChatTab] retryAiResponseRef.current is null, falling back to sendMessage",
            );
          }
        }, 0);
      }
    },
  };
  setMessagesSync((prev) => [...prev, errorMsg]);
}
