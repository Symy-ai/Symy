import { describe, expect, it } from 'vitest';
import { buildShoppingClarifySseStream, buildShoppingClarifyTurn, isShoppingClarifyAnswer } from '../shopping-clarify-turn';

describe('shopping clarify turn', () => {
  it('returns no turn for machine answers', () => {
    expect(buildShoppingClarifyTurn({ userContent: '[symy-clarify:gift] For her', locale: 'en' })).toBeNull();
    expect(isShoppingClarifyAnswer(' [symy-clarify:skip] ')).toBe(true);
  });

  it('builds a short stream with card and done event', async () => {
    const turn = buildShoppingClarifyTurn({ userContent: '买点给孩子的东西', locale: 'zh' });
    expect(turn?.shoppingClarifyCard.slot).toBe('category');
    const reader = buildShoppingClarifySseStream(turn!).getReader();
    const decoder = new TextDecoder();
    const first = JSON.parse(decoder.decode((await reader.read()).value!).split('data: ')[1]);
    expect(first.type).toBe('shopping_clarify_card');
    await reader.cancel();
  });
});
