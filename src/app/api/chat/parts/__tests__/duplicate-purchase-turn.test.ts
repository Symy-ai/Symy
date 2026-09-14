import { describe, expect, it } from 'vitest';
import { detectDuplicatePurchase } from '../duplicate-purchase-detect';
import { buildDuplicatePurchaseSseStream, buildDuplicatePurchaseTurn } from '../duplicate-purchase-turn';

describe('duplicate-purchase detector', () => {
  it.each([
    ['我还有必要再买一根手机线吗', 'electronics'],
    ['家里有没有酱油吗', 'food'],
    ['我已经有一个收纳盒了还能买吗', 'home'],
    ['我还有必要再开一个会员吗', 'other'],
    ['Do I need another charging cable if I already have one?', 'electronics'],
    ['Do we have soy sauce at home?', 'food'],
    ['I already have a storage box, should I get another?', 'home'],
    ['Should I renew my membership if I already have one?', 'other'],
  ])('%s hits %s', (text, category) => {
    expect(detectDuplicatePurchase(text)?.category).toBe(category);
  });

  it.each([
    '我想把手机线卖掉',
    '这个收纳盒送给朋友好吗',
    '什么是复利',
    'A还是B哪个好',
    '周末要买这些：数据线、酱油、收纳盒',
    '今天天气不错',
    'I want to sell my charging cable',
    'What is compound interest?',
  ])('%s does not hit', (text) => {
    expect(detectDuplicatePurchase(text)).toBeNull();
  });
});

describe('duplicate-purchase canned turn', () => {
  it('returns card and shame-safe reply', () => {
    const turn = buildDuplicatePurchaseTurn({ userContent: '家里有没有酱油吗', locale: 'zh', rng: () => 0 });
    expect(turn?.duplicatePrecheckCard.category).toBe('food');
    expect(turn?.reply).toContain('暂停');
  });

  it('SSE card precedes tokens and done', async () => {
    const turn = buildDuplicatePurchaseTurn({ userContent: 'Do we have soy sauce at home?', locale: 'en' })!;
    const text = await new Response(buildDuplicatePurchaseSseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.slice(6)));
    expect(events[0].type).toBe('duplicate_precheck_card');
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe(turn.reply);
  });
});
