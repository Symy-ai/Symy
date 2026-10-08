import { describe, expect, it } from 'vitest';
import {
  PRECHECK_REGISTRY,
  PRECHECK_REGISTRY_SIZE,
  WAVE1_OUT_OF_REGISTRY,
  findPrecheckSpec,
  MOOD_OPTIONS,
  WINDOW_OPTIONS,
  CATEGORY_OPTIONS,
  CONTEXT_SIGNAL_OPTIONS,
  CLARIFY_SLOT_OPTIONS,
} from '../precheck-registry';

describe('PRECHECK_REGISTRY 登记簿结构完整性 (b128 口径 20条)', () => {
  it('实际条数 = PRECHECK_REGISTRY_SIZE = 20', () => {
    expect(PRECHECK_REGISTRY).toHaveLength(PRECHECK_REGISTRY_SIZE);
    expect(PRECHECK_REGISTRY_SIZE).toBe(20);
  });

  it('detectorId 全局唯一', () => {
    const ids = PRECHECK_REGISTRY.map(s => s.detectorId);
    expect(new Set(ids).size).toBe(20);
  });

  it('question.id 全局唯一 (choice/noul 共池)', () => {
    const qids = PRECHECK_REGISTRY.map(s => s.question.id);
    expect(new Set(qids).size).toBe(20);
  });

  it('source 只有两类: parts/lib; 12 parts + 8 lib (b128 计数口径)', () => {
    const parts = PRECHECK_REGISTRY.filter(s => s.source === 'parts');
    const lib = PRECHECK_REGISTRY.filter(s => s.source === 'lib');
    expect(parts).toHaveLength(12);
    expect(lib).toHaveLength(8);
  });

  it('kind 只有两类: choice/noul; choice 必有 options, noul 必无', () => {
    for (const s of PRECHECK_REGISTRY) {
      if (s.question.kind === 'choice') {
        expect(s.question.options.length).toBeGreaterThanOrEqual(2);
      } else {
        expect(s.question).not.toHaveProperty('options');
      }
    }
  });

  it('每条都有 ruleRef (规则层锚点) + statement (b131 措辞迭代)', () => {
    for (const s of PRECHECK_REGISTRY) {
      expect(s.ruleRef).toBeTruthy();
      const stmt = (s.question as { statement?: string }).statement;
      expect(stmt).toBeTruthy();
      expect(stmt!.length).toBeGreaterThan(4);
    }
  });

  it('choice 档位引用共享词表常量 (枚举收敛)', () => {
    const byQid = (qid: string) => PRECHECK_REGISTRY.find(s => s.question.id === qid)!.question as { kind: string; options: string[] };
    expect(byQid('emotion-shopping-mood').options).toEqual([...MOOD_OPTIONS]);
    expect(byQid('savings-query-window').options).toEqual([...WINDOW_OPTIONS]);
    expect(byQid('micro-challenge-category').options).toEqual([...CATEGORY_OPTIONS]);
    // impulse-time-window 用的是 WINDOW 词表; TIME_BUCKET_OPTIONS 是另一单元的档位
    expect(byQid('impulse-time-window').options).toEqual([...WINDOW_OPTIONS]);
    expect(byQid('context-signal-type').options).toEqual([...CONTEXT_SIGNAL_OPTIONS]);
    expect(byQid('shopping-clarify-slot').options).toEqual([...CLARIFY_SLOT_OPTIONS]);
  });
});

describe('findPrecheckSpec', () => {
  it('按 detectorId 查到登记项', () => {
    const spec = findPrecheckSpec('shopping-clarify');
    expect(spec?.question.id).toBe('shopping-clarify-slot');
    expect(spec?.source).toBe('lib');
  });

  it('未登记返回 undefined', () => {
    expect(findPrecheckSpec('nonexistent-detector')).toBeUndefined();
  });
});

describe('WAVE1_OUT_OF_REGISTRY (显式排除: 不悄悄忘掉)', () => {
  it('两条排除项, 各带理由', () => {
    expect(WAVE1_OUT_OF_REGISTRY).toHaveLength(2);
    for (const item of WAVE1_OUT_OF_REGISTRY) {
      expect(item.detectorId).toBeTruthy();
      expect(item.reason.length).toBeGreaterThan(10);
    }
    const ids = WAVE1_OUT_OF_REGISTRY.map(i => i.detectorId);
    expect(ids).toContain('green-alt-retro-gate');
    expect(ids).toContain('follow-up-query');
  });

  it('排除项不在主登记簿 (无双重身份)', () => {
    for (const out of WAVE1_OUT_OF_REGISTRY) {
      expect(findPrecheckSpec(out.detectorId)).toBeUndefined();
    }
  });
});

describe('b131 措辞红线 (choice statement 锚点)', () => {
  it('九个 choice 问题的 statement 以推断任务开头 (根据用户消息判断)', () => {
    const choices = PRECHECK_REGISTRY.filter(s => s.question.kind === 'choice');
    expect(choices.length).toBeGreaterThanOrEqual(9);
    const withStatement = choices.filter(s =>
      (s.question as { statement?: string }).statement?.startsWith('根据用户消息判断'));
    expect(withStatement.length).toBeGreaterThanOrEqual(9);
  });
});
