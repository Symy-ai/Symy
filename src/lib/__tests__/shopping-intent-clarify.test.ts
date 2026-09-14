import { describe, expect, it } from 'vitest';
import { classifyShoppingIntent, existingCategoryOf } from '../shopping-intent-clarify';

type Locale = 'en' | 'zh';

describe('classifyShoppingIntent', () => {
  it.each([
    ['朋友说这家店很好', 'zh'],
    ['My friend said this shop is nice', 'en'],
  ])('marks non-purchase mention (%s)', (message: string, locale: string) => {
    expect(classifyShoppingIntent({ message, locale: locale as Locale }).confidence).toBe('not_purchase');
  });

  it.each([
    ['帮我妈看看，她自己要买还是送人我不确定', 'zh'],
    ['Help me look for my mom — not sure if it\'s for her or a gift', 'en'],
  ])('clarifies recipient (%s)', (message: string, locale: string) => {
    expect(classifyShoppingIntent({ message, locale: locale as Locale })).toMatchObject({ confidence: 'clarify', data: { slot: 'recipient' } });
  });

  it.each([
    ['买点给孩子的东西', 'zh'],
    ['I need to buy something for the kids', 'en'],
  ])('clarifies category (%s)', (message: string, locale: string) => {
    expect(classifyShoppingIntent({ message, locale: locale as Locale })).toMatchObject({ confidence: 'clarify', data: { slot: 'category' } });
  });

  it.each([
    ['下个月再看看露营的东西', 'zh'],
    ['Maybe look at camping gear next month', 'en'],
  ])('clarifies timing (%s)', (message: string, locale: string) => {
    expect(classifyShoppingIntent({ message, locale: locale as Locale })).toMatchObject({ confidence: 'clarify', data: { slot: 'timing' } });
  });

  it.each([
    ['我想买 AirPods', 'zh'],
    ['I want to buy AirPods', 'en'],
    ['我又想点奶茶了', 'zh'],
    ['I want bubble tea again', 'en'],
    ['帮我搜一双跑鞋', 'zh'],
    ['Help me search for running shoes', 'en'],
  ])('keeps clear purchases high-confidence (%s)', (message: string, locale: string) => {
    expect(classifyShoppingIntent({ message, locale: locale as Locale })).toEqual({ confidence: 'high' });
  });

  it('asks one clarification per subject per session', () => {
    const message = '买点给孩子的东西';
    const first = classifyShoppingIntent({ message, locale: 'zh' });
    expect(first.confidence).toBe('clarify');
    if (first.confidence !== 'clarify') throw new Error('expected clarification');
    expect(classifyShoppingIntent({ message, locale: 'zh', askedSubjects: [first.data.subject] })).toEqual({ confidence: 'high' });
  });

  it('maps text to existing guard categories', () => {
    expect(existingCategoryOf('我想买手机')).toBe('electronics');
    expect(existingCategoryOf('I want bubble tea again')).toBe('food');
    expect(existingCategoryOf('Something vague')).toBeNull();
  });
});
