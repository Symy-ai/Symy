'use client';

import { useI18n } from '@/i18n/provider';
import { markShoppingSubjectAsked } from './shopping-clarify-store';
import type { ShoppingClarifyCardData } from '@/types/shopping-clarify-card';

interface ShoppingClarifyCardProps {
  data: ShoppingClarifyCardData;
  onSendMessage?: (content: string) => void | Promise<void>;
}

export function ShoppingClarifyCard({ data, onSendMessage }: ShoppingClarifyCardProps) {
  const { t } = useI18n();

  const send = (token: string) => {
    markShoppingSubjectAsked(data.subject);
    void onSendMessage?.(`${token} ${t(`chat.shoppingClarify.${data.slot}.question`)}`);
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.shoppingClarify.title')}
      data-testid="shopping-clarify-card"
    >
      <p className="text-xs leading-relaxed text-text-secondary">
        {t(`chat.shoppingClarify.${data.slot}.question`)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {data.answers.map((answer) => (
          <button
            key={answer.token}
            type="button"
            className="rounded-full border border-glass-border px-3 py-1 text-xs text-text-primary hover:bg-glass-fill"
            onClick={() => send(answer.token)}
          >
            {t(`chat.shoppingClarify.answers.${answer.key}`)}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full border border-glass-border px-3 py-1 text-xs text-text-secondary hover:bg-glass-fill"
          onClick={() => {
            markShoppingSubjectAsked(data.subject);
            void onSendMessage?.('[symy-clarify:skip]');
          }}
        >
          {t('chat.shoppingClarify.answers.skip')}
        </button>
      </div>
    </aside>
  );
}
