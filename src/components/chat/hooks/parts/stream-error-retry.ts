import type { ChatMessage } from "@/components/chat-bubble";

type SetMessagesSync = (
  updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
) => void;

interface StreamErrorRetryArgs {
  assistantMsgId: string;
  setMessagesSync: SetMessagesSync;
  messagesRef?: React.MutableRefObject<ChatMessage[]>;
  sendMessageLockRef: React.MutableRefObject<{
    inProgress: boolean;
    lastContent: string;
    lastTime: number;
  }>;
  retryAiResponseRef: React.MutableRefObject<
    ((content: string) => Promise<void>) | null
  >;
  retryContent?: string;
  releaseLockBeforeRetry?: boolean;
  skipIfLocked?: boolean;
}

export function createStreamErrorRetry({
  assistantMsgId,
  setMessagesSync,
  messagesRef,
  sendMessageLockRef,
  retryAiResponseRef,
  retryContent,
  releaseLockBeforeRetry = true,
  skipIfLocked = false,
}: StreamErrorRetryArgs) {
  return () => {
    if (skipIfLocked && sendMessageLockRef.current.inProgress) return;

    setMessagesSync((prev) =>
      prev.filter((message) => message.id !== assistantMsgId),
    );

    let content: string | undefined = retryContent;
    if (messagesRef) {
      const lastUserMessage = messagesRef.current
        .filter((message) => message.role === "user")
        .pop();
      content = lastUserMessage?.content;
    }
    if (content === undefined) return;

    if (releaseLockBeforeRetry) {
      sendMessageLockRef.current.inProgress = false;
    }
    setTimeout(() => {
      retryAiResponseRef.current?.(content);
    }, 0);
  };
}

export function markStreamErrorBubble({
  assistantMsgId,
  content,
  setMessagesSync,
  onRetry,
}: {
  assistantMsgId: string;
  content: string;
  setMessagesSync: SetMessagesSync;
  onRetry: () => void;
}) {
  setMessagesSync((prev) =>
    prev.map((message) =>
      message.id === assistantMsgId
        ? { ...message, content, isError: true, onRetry }
        : message,
    ),
  );
}
