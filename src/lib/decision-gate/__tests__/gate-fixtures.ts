/**
 * LLMWrapperGate 测试夹具 —— 两个测试文件共用（避免重复定义漂移）
 */

import { expect, vi } from 'vitest';
import {
  LLMWrapperGate,
  type GateLLMCall,
  type GateQuestion,
  type GateState,
} from '@/lib/decision-gate';

export const STATE: GateState = { id: 'search-batch-1', text: '用户搜索：环保洗衣液', meta: { locale: 'zh' } };

export const NOUL: GateQuestion[] = [{ kind: 'noul', id: 'is-green', statement: '该商品是环保可持续的' }];

export const CHOICE: GateQuestion[] = [
  { kind: 'choice', id: 'intent', options: ['buy-now', 'research', 'gift'] },
];

/** 高/中/低/未知 四档 + 描述（5 档量表见 llm-wrapper-gate.test.ts 的 score 用例） */
export const SCORE: GateQuestion[] = [
  {
    kind: 'score',
    id: 'green-level',
    levels: [
      { label: 'unknown' },
      { label: 'low' },
      { label: 'medium', description: '有部分环保属性' },
      { label: 'high' },
    ],
  },
];

/** 断言标量 value 落在 [0,1]（noul / score 形状） */
export function expectScalarInRange(result: { value: number | number[] }): void {
  expect(typeof result.value).toBe('number');
  expect(result.value as number).toBeGreaterThanOrEqual(0);
  expect(result.value as number).toBeLessThanOrEqual(1);
}

/** 固定回一句模型回复的 gate（fake 保持 Promise 签名，值同步可得） */
export function gateReturning(reply: string): LLMWrapperGate {
  return new LLMWrapperGate({ call: vi.fn(() => Promise.resolve(reply)) });
}

/** 暴露 call 的 mock，便于断言「有没有被调用」 */
export function gateWithSpy(): { gate: LLMWrapperGate; call: ReturnType<typeof vi.fn<GateLLMCall>> } {
  // eslint-disable-next-line require-await -- fake call 保持 Promise 签名，无真实 await
  const call = vi.fn<GateLLMCall>(async () => '{}');
  return { gate: new LLMWrapperGate({ call }), call };
}
