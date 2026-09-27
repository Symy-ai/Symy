/**
 * LLMWrapperGate 契约形状单测 — 三类问题的 value/confidence/latency 形状
 *
 * 依赖注入：直接传 fake call，不需要 vi.mock。
 */

import { describe, it, expect } from 'vitest';
import {
  CHOICE,
  NOUL,
  SCORE,
  STATE,
  expectScalarInRange,
  gateReturning,
  gateWithSpy,
} from './gate-fixtures';

describe('LLMWrapperGate — 契约形状', () => {
  it('noul 问题：value/confidence 落在 [0,1]，latencyMs ≥ 0', async () => {
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'is-green', value: 0.82, confidence: 0.7 }] }),
    );
    const [result] = await gate.evaluate(STATE, NOUL);

    expect(result.id).toBe('is-green');
    expect(result.kind).toBe('noul');
    expectScalarInRange(result);
    expect(result.value).toBeCloseTo(0.82, 5);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('choice 问题：返回与 options 等长的分布且和 ≈ 1（±0.05）', async () => {
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'intent', value: [0.6, 0.3, 0.1], confidence: 0.55 }] }),
    );
    const [result] = await gate.evaluate(STATE, CHOICE);

    expect(Array.isArray(result.value)).toBe(true);
    const distribution = result.value as number[];
    expect(distribution).toHaveLength(3);
    expect(distribution.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 2);
    expect(Math.abs(distribution.reduce((sum, w) => sum + w, 0) - 1)).toBeLessThanOrEqual(0.05);
  });

  it('choice 分布长度不对时补齐/截断到 options 长度并重新归一', async () => {
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'intent', value: [0.8], confidence: 0.4 }] }),
    );
    const [result] = await gate.evaluate(STATE, CHOICE);

    const distribution = result.value as number[];
    expect(distribution).toHaveLength(3);
    expect(distribution[0]).toBeCloseTo(1, 5);
    expect(distribution[1]).toBe(0);
  });

  it('score 多档：value 落在 [0,1]（档位按 index/(len-1) 归一）', async () => {
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'green-level', value: 0.66, confidence: 0.6 }] }),
    );
    const [result] = await gate.evaluate(STATE, SCORE);

    expect(result.kind).toBe('score');
    expectScalarInRange(result);
    expect(result.value as number).toBeCloseTo(0.66, 5);
  });

  it('score 5 档：value 落在 [0,1]', async () => {
    const levels = ['unknown', 'low', 'medium', 'high', 'purer'].map((label) => ({ label }));
    const gate = gateReturning(
      JSON.stringify({ results: [{ id: 'green-level', value: 0.75, confidence: 0.5 }] }),
    );
    const [result] = await gate.evaluate(STATE, [{ kind: 'score', id: 'green-level', levels }]);

    expect(result.kind).toBe('score');
    expectScalarInRange(result);
  });

  it('三种问题混装：按 questions 顺序逐条回填，不多不少', async () => {
    const gate = gateReturning(
      JSON.stringify({
        results: [
          { id: 'intent', value: [0.2, 0.5, 0.3], confidence: 0.5 },
          { id: 'is-green', value: 0.4, confidence: 0.3 },
          { id: 'green-level', value: 0.5, confidence: 0.9 },
        ],
      }),
    );
    const results = await gate.evaluate(STATE, [...NOUL, ...CHOICE, ...SCORE]);

    expect(results.map((r) => r.id)).toEqual(['is-green', 'intent', 'green-level']);
    expect(results.map((r) => r.kind)).toEqual(['noul', 'choice', 'score']);
  });

  it('provider 恒为 llm-wrapper', () => {
    expect(gateReturning('{}').provider).toBe('llm-wrapper');
  });

  it('空 questions 数组：返回空数组且完全不调 LLM', async () => {
    const { gate, call } = gateWithSpy();

    expect(await gate.evaluate(STATE, [])).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it('序列化 state + questions 进一条 JSON 指令（单 state 多问题打包）', async () => {
    const { gate, call } = gateWithSpy();

    await gate.evaluate(STATE, CHOICE);

    expect(call).toHaveBeenCalledTimes(1);
    const [messages, options] = call.mock.calls[0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    const payload = JSON.parse(messages[1].content) as {
      state: { id: string; text: string };
      questions: { id: string; kind: string }[];
    };
    expect(payload.state.id).toBe('search-batch-1');
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].id).toBe('intent');
    expect(options?.temperature).toBe(0);
  });
});
