/**
 * LLMWrapperGate 容错 + 开关单测
 *
 * 容错契约：模型回垃圾/漏答/越界都不抛异常，单个问题落 {value:0, confidence:0}——
 * 两级门里语义层只是 bonus，失败等于没命中，规则快路径继续（方案 §2 降级链）。
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { LLMWrapperGate, isDecisionGateEnabled } from '@/lib/decision-gate';
import { CHOICE, NOUL, SCORE, STATE, gateReturning } from './gate-fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LLMWrapperGate — 解析容错', () => {
  it('```json 围栏包裹的回复照样解析', async () => {
    const gate = gateReturning(
      '这是我的判断：\n```json\n{"results":[{"id":"is-green","value":0.9,"confidence":0.8}]}\n```\n希望有帮助',
    );
    const [result] = await gate.evaluate(STATE, NOUL);

    expect(result.value).toBeCloseTo(0.9, 5);
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('JSON 前后带解释文字仍能取到最外层对象', async () => {
    const gate = gateReturning(
      'Sure! {"results":[{"id":"is-green","value":0.25,"confidence":0.4}]} — done',
    );
    const [result] = await gate.evaluate(STATE, NOUL);

    expect(result.value).toBeCloseTo(0.25, 5);
  });

  it('垃圾文本：全部问题落 value=0 / confidence=0，不 throw', async () => {
    const gate = gateReturning('抱歉，我无法完成这个任务。');
    const results = await gate.evaluate(STATE, [...NOUL, ...CHOICE, ...SCORE]);

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('部分缺失：模型只答了一个问题，没答的落 0', async () => {
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'intent', value: [0.5, 0.5, 0], confidence: 0.6 }] }),
    );
    const results = await gate.evaluate(STATE, [...CHOICE, ...NOUL]);

    expect(results[0].value).toHaveLength(3);
    expect(results[1].id).toBe('is-green');
    expect(results[1].value).toBe(0);
    expect(results[1].confidence).toBe(0);
  });

  it('越界与非法值归一到 [0,1]，非数类型落 0', async () => {
    const gate = gateReturning(
      JSON.stringify({
        results: [
          { id: 'is-green', value: 42, confidence: -1 },
          { id: 'intent', value: ['a', 2, 0.5], confidence: 'high' },
          { id: 'green-level', value: null, confidence: 0.5 },
        ],
      }),
    );
    const [noul, choice, score] = await gate.evaluate(STATE, [...NOUL, ...CHOICE, ...SCORE]);

    expect(noul.value).toBe(1);
    expect(noul.confidence).toBe(0);
    expect(choice.value).toHaveLength(3);
    expect((choice.value as number[]).every((w) => w >= 0 && w <= 1)).toBe(true);
    expect(choice.confidence).toBe(0);
    expect(score.value).toBe(0);
  });

  it('JSON 语法错误不 throw，全部落 0', async () => {
    const gate = gateReturning('{"results": [{"id": "is-green", value: 0.7,');
    const [result] = await gate.evaluate(STATE, NOUL);

    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
  });
});

describe('decision-gate barrel + 开关', () => {
  it('isDecisionGateEnabled 默认关，DECISION_GATE_ENABLED=1 才开', () => {
    vi.stubEnv('DECISION_GATE_ENABLED', undefined);
    expect(isDecisionGateEnabled()).toBe(false);

    vi.stubEnv('DECISION_GATE_ENABLED', 'true');
    expect(isDecisionGateEnabled()).toBe(false);

    vi.stubEnv('DECISION_GATE_ENABLED', '1');
    expect(isDecisionGateEnabled()).toBe(true);
  });

  it('barrel 导出 LLMWrapperGate 实现', () => {
    expect(typeof LLMWrapperGate).toBe('function');
    // eslint-disable-next-line require-await -- fake call 保持 Promise 签名，无真实 await
    expect(new LLMWrapperGate({ call: async () => '{}' }).provider).toBe('llm-wrapper');
  });
});
