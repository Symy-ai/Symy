import { describe, expect, it } from 'vitest';

import { matchGreenKnowledge, greenKnowledgeLabel } from '../green-knowledge-query';

describe('matchGreenKnowledge (知识型提问检测)', () => {
  it('命中: "refurb 值得买吗" → refurb_gadget (知识触发词 + 泛化价值问句)', () => {
    expect(matchGreenKnowledge('refurb 值得买吗')).toContain('refurb_gadget');
  });

  it('命中: "is buying refurbished worth it" → refurb_gadget (en 混说)', () => {
    expect(matchGreenKnowledge('is buying refurbished worth it')).toContain('refurb_gadget');
  });

  it('命中: "二手平台靠谱吗" → refurb_gadget (zh 知识触发词)', () => {
    expect(matchGreenKnowledge('二手平台靠谱吗')).toContain('refurb_gadget');
  });

  it('命中: 现有 triggers + 疑问词组合 ("平板值得吗")', () => {
    expect(matchGreenKnowledge('平板值得吗')).toContain('secondhand_audio_tablet');
  });

  it('命中: 纯知识提问 "什么是快时尚" (无购买动词)', () => {
    expect(matchGreenKnowledge('什么是快时尚')).toContain('fast_fashion');
  });

  it('购买意图优先: "我想买个新的 iPad" → null (走 green-alt-detect)', () => {
    expect(matchGreenKnowledge('我想买个新的 iPad')).toBeNull();
  });

  it('购买意图优先: "买 ivory 手镯靠谱吗" → null (混说但按购买意图处理)', () => {
    expect(matchGreenKnowledge('买 ivory 手镯靠谱吗')).toBeNull();
  });

  it('购买意图优先: "want to buy a fur coat" → null', () => {
    expect(matchGreenKnowledge('want to buy a fur coat?')).toBeNull();
  });

  it('未命中: 无疑问指示词的品类提及 ("说下二手平台") → null', () => {
    expect(matchGreenKnowledge('说下二手平台')).toBeNull();
  });

  it('未命中: 疑问词但无品类词 ("今天天气怎么样") → null', () => {
    expect(matchGreenKnowledge('今天天气怎么样')).toBeNull();
  });

  it('未命中: 空串/非字符串 → null', () => {
    expect(matchGreenKnowledge('')).toBeNull();
    expect(matchGreenKnowledge('   ')).toBeNull();
  });

  it('上限: 一条消息最多 3 个词条', () => {
    const hits = matchGreenKnowledge('refurb 平板 耳机 值得买吗?');
    expect(hits).not.toBeNull();
    expect(hits!.length).toBeLessThanOrEqual(3);
  });
});

describe('greenKnowledgeLabel (chip 展示名)', () => {
  it('已登记词条: 按 locale 取展示名', () => {
    expect(greenKnowledgeLabel('refurb_gadget', 'zh')).toBe('翻新机');
    expect(greenKnowledgeLabel('refurb_gadget', 'en')).toBe('Refurbished');
  });

  it('未登记词条: 回退到 id (batch47-c 新词条不炸)', () => {
    expect(greenKnowledgeLabel('food_future_id', 'zh')).toBe('food_future_id');
  });
});
