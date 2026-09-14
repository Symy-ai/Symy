import { detectDuplicatePurchase } from './duplicate-purchase-detect';
import type { DuplicatePrecheckCardData } from '@/types/duplicate-purchase';

export interface DuplicatePurchaseTurn {
  reply: string;
  duplicatePrecheckCard: DuplicatePrecheckCardData;
}

const REPLIES: Record<'en' | 'zh', readonly string[]> = {
  en: [
    'Little Elephant will press pause with you — no shame, just a quick check.',
    'Let’s check the existing one first. Little Elephant will wait right here.',
  ],
  zh: [
    '大象先帮你按一下暂停——不是不许买，只是先看看家里。',
    '先找找已有的，大象在这儿陪你等结果。',
  ],
};

export function buildDuplicatePurchaseTurn(input: { userContent: string; locale: 'en' | 'zh'; rng?: () => number }): DuplicatePurchaseTurn | null {
  const intent = detectDuplicatePurchase(input.userContent);
  if (!intent) return null;
  const variants = REPLIES[input.locale];
  const index = input.rng ? Math.floor(input.rng() * variants.length) % variants.length : 0;
  return {
    reply: variants[index],
    duplicatePrecheckCard: { itemTitle: intent.itemTitle, category: intent.category },
  };
}

export function duplicatePrecheckSseEvent(card: DuplicatePrecheckCardData) {
  return { type: 'duplicate_precheck_card', duplicatePrecheckCard: card };
}

export function buildDuplicatePurchaseSseStream(turn: DuplicatePurchaseTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(duplicatePrecheckSseEvent(turn.duplicatePrecheckCard))}\n\n`));
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
