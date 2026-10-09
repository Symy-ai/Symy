import { describe, expect, it } from 'vitest';

import type {
  DecisionGate,
  GateLevelDesc,
  GateProvider,
  GateQuestion,
  GateResult,
  GateState,
} from '../types';

/**
 * decision-gate/types.ts (84行) — 两级门契约 (Jev 引入方案 §4)。
 *
 * 方法论第五用: 编译期 import 验证 + satisfies 字段锚定。
 * 锁定: 三类问题 (noul/choice/score) / GateState 三字段 / GateResult 五字段
 * (含 latencyMs 300ms 预算锚) / DecisionGate 双成员 (evaluate+readonly provider)
 * / 供应商三元组。
 */

const noul = { kind: 'noul', id: 'q1', statement: '用户想买贵价键盘' } satisfies GateQuestion;
const choice = { kind: 'choice', id: 'q2', options: ['electronics', 'tired'], statement: '分类' } satisfies GateQuestion;
const choiceBare = { kind: 'choice', id: 'q2b', options: ['a', 'b'] } satisfies GateQuestion; // statement 选填 (b131 前)
const score = {
  kind: 'score',
  id: 'q3',
  levels: [{ label: 'low' }, { label: 'medium', description: '中等' }, { label: 'high' }] as GateLevelDesc[],
} satisfies GateQuestion;

const state = { id: 's1', text: '帮我看看这个键盘', meta: { source: 'chat' } } satisfies GateState;
const stateBare = { id: 's2', text: '裸 state 无 meta' } satisfies GateState; // meta 选填

const result: GateResult = {
  id: 'q1',
  kind: 'noul',
  confidence: 0.87,
  value: 0.92,
  latencyMs: 180, // < 300ms 预算
};

const gate: DecisionGate = {
  provider: 'llm-wrapper',
  evaluate: (_s, questions) =>
    Promise.resolve(
      questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        confidence: 0,
        value: q.kind === 'choice' ? [0.5, 0.5] : 0,
        latencyMs: 1,
      })),
    ),
};

const providers: GateProvider[] = ['jev', 'llm-wrapper', 'rules'];

describe('decision-gate/types 两级门契约', () => {
  it('三类问题形状: noul statement 必填 / choice statement 选填 / score levels', () => {
    expect(noul.statement).toBe('用户想买贵价键盘');
    expect(choice.statement).toBe('分类');
    expect((choiceBare as GateQuestion & { statement?: string }).statement).toBeUndefined();
    expect(score.levels).toHaveLength(3);
    expect(score.levels[1].description).toBe('中等');
  });

  it('GateState: text 必填 / meta 选填', () => {
    expect(state.meta?.source).toBe('chat');
    expect((stateBare as GateState & { meta?: unknown }).meta).toBeUndefined();
  });

  it('GateResult 五字段: 含 latencyMs (300ms 预算锚) + value 双形状', () => {
    expect(result.latencyMs).toBeLessThan(300);
    const choiceResult: GateResult = { id: 'q2', kind: 'choice', confidence: 0.6, value: [0.7, 0.3], latencyMs: 90 };
    expect(Array.isArray(choiceResult.value)).toBe(true);
  });

  it('DecisionGate: evaluate 并行评估契约 (失败=零值不抛)', async () => {
    const out = await gate.evaluate(state, [noul, choice]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'q1', confidence: 0 });
    expect(gate.provider).toBe('llm-wrapper');
  });

  it('GateProvider 三元组', () => {
    expect(providers).toEqual(['jev', 'llm-wrapper', 'rules']);
  });
});
