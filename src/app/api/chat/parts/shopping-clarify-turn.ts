import { classifyShoppingIntent } from '@/lib/shopping-intent-clarify';

export interface ShoppingClarifyCardData {
  subject: string;
  slot: 'recipient' | 'category' | 'timing';
  answers: Array<{ token: string; key: string }>;
}

export interface ShoppingClarifyTurn {
  reply: string;
  shoppingClarifyCard: ShoppingClarifyCardData;
}

export interface BuildShoppingClarifyTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  askedSubjects?: readonly string[];
}

export const SHOPPING_CLARIFY_SKIP_TOKEN = '[symy-clarify:skip]';

export function isShoppingClarifyAnswer(message: string): boolean {
  return /^\[symy-clarify:[a-z-]+\]/.test(message.trim());
}

export function buildShoppingClarifyTurn(input: BuildShoppingClarifyTurnInput): ShoppingClarifyTurn | null {
  const { userContent } = input;
  if (isShoppingClarifyAnswer(userContent)) return null;
  const result = classifyShoppingIntent({ message: userContent, locale: input.locale, askedSubjects: input.askedSubjects });
  if (result.confidence !== 'clarify') return null;

  const answers = result.data.slot === 'recipient'
    ? [{ token: '[symy-clarify:for-her]', key: 'forHer' }, { token: '[symy-clarify:gift]', key: 'gift' }]
    : result.data.slot === 'category'
      ? [{ token: '[symy-clarify:electronics]', key: 'electronics' }, { token: '[symy-clarify:clothing]', key: 'clothing' }, { token: '[symy-clarify:food]', key: 'food' }]
      : [{ token: '[symy-clarify:research-now]', key: 'researchNow' }, { token: '[symy-clarify:buy-later]', key: 'buyLater' }];

  return {
    reply: input.locale === 'zh' ? '我先确认一下，避免会错意。' : 'Let me check one thing so I understand you correctly.',
    shoppingClarifyCard: { ...result.data, answers },
  };
}

export function buildShoppingClarifySseStream(turn: ShoppingClarifyTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const event = (value: unknown) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event({ type: 'shopping_clarify_card', shoppingClarifyCard: turn.shoppingClarifyCard }));
      for (const chunk of turn.reply.match(/.{1,15}/g) ?? [turn.reply]) {
        controller.enqueue(event({ type: 'token', content: chunk }));
      }
      controller.enqueue(event({ type: 'done' }));
      controller.close();
    },
  });
}
