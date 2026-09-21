interface FinalizeSendMessageArgs {
  abortRef: React.MutableRefObject<AbortController | null>;
  sendMessageLockRef: React.MutableRefObject<{
    inProgress: boolean;
    lastContent: string;
    lastTime: number;
  }>;
  setIsLoading: (value: boolean) => void;
  skipNextHistoryLoadRef: React.MutableRefObject<boolean>;
  skipNonceRef: React.MutableRefObject<number>;
  justBoughtChallengeRef: React.MutableRefObject<boolean>;
  abortController: AbortController;
}

export function finalizeSendMessage({
  abortRef,
  sendMessageLockRef,
  setIsLoading,
  skipNextHistoryLoadRef,
  skipNonceRef,
  justBoughtChallengeRef,
  abortController,
}: FinalizeSendMessageArgs) {
  if (abortRef.current === abortController) {
    abortRef.current = null;
    sendMessageLockRef.current.inProgress = false;
    setIsLoading(false);
    skipNextHistoryLoadRef.current = true;
    skipNonceRef.current = Date.now();
    justBoughtChallengeRef.current = false;
  }
}
