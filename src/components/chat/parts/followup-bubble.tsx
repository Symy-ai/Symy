'use client';

export interface FollowupBubbleProps {
  testId: string;
  question: string;
  primaryAction: {
    label: string;
    testId: string;
    onSelect: () => void;
  };
  secondaryAction: {
    label: string;
    testId: string;
    onSelect: () => void;
  };
}

export function FollowupBubble({
  testId,
  question,
  primaryAction,
  secondaryAction,
}: FollowupBubbleProps) {
  return (
    <div
      data-testid={testId}
      className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border flex items-center gap-2"
    >
      <span className="text-[11px] text-text-secondary flex-1 min-w-0">
        🐘 {question}
      </span>
      <button
        onClick={primaryAction.onSelect}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-glass-border bg-glass-fill text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
        data-testid={primaryAction.testId}
      >
        {primaryAction.label}
      </button>
      <button
        onClick={secondaryAction.onSelect}
        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
        data-testid={secondaryAction.testId}
      >
        {secondaryAction.label}
      </button>
    </div>
  );
}

export function FollowupAnsweredBubble({
  testId,
  answer,
}: {
  testId: string;
  answer: string;
}) {
  return (
    <div
      data-testid={testId}
      className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border text-[11px] text-text-secondary"
    >
      🐘 {answer}
    </div>
  );
}
