/**
 * runUnifiedPrecheck 骨架单测 —— 打包 / 对齐 / 降级 三条契约
 *
 * 测的是「两级门」的降级纪律（方案 §2）：
 *   语义层失败/超时 = 没命中，规则快路径继续，**行为与今天一致**，绝不把异常
 *   冒泡到 chat route（route 里挂一次预检失败 = 整个消息 500）。
 *
 * gate 一律用 fake（不 mock 模块、不打网络），fake 的形状就是 DecisionGate 契约。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  PRECHECK_DEFAULT_TIMEOUT_MS,
  runUnifiedPrecheck,
  type PrecheckQuestionSpec,
} from '@/lib/decision-gate/unified-precheck-gate';
import {
  PRECHECK_REGISTRY,
  PRECHECK_REGISTRY_SIZE,
  WAVE1_OUT_OF_REGISTRY,
  findPrecheckSpec,
} from '@/lib/decision-gate/precheck-registry';
import type { DecisionGate, GateQuestion, GateResult, GateState } from '@/lib/decision-gate';

const STATE: GateState = { id: 'msg-1', text: '今天好累，想买点东西哄自己', meta: { locale: 'zh' } };

/** 三种 question kind 各一，供对齐/降级用例复用 */
const SPECS: PrecheckQuestionSpec[] = [
  {
    detectorId: 'emotion-shopping-detector',
    source: 'parts',
    question: { kind: 'noul', id: 'mood', statement: '这条消息表达了用购物缓解情绪的意图' },
    ruleRef: 'src/app/api/chat/parts/emotion-shopping-detector.ts',
  },
  {
    detectorId: 'pushback-detector',
    source: 'lib',
    question: { kind: 'choice', id: 'tone', options: ['firm', 'annoyed'] },
    ruleRef: 'src/lib/pushback-detector.ts',
  },
  {
    detectorId: 'prepurchase-detect',
    source: 'lib',
    question: { kind: 'choice', id: 'window', options: ['lastWeek', 'thisWeek'] },
    ruleRef: 'src/lib/prepurchase-detect.ts',
  },
];

/** fake gate：记录调用次数与问题清单，按脚本返回原始结果（可乱序/可漏答/可违约/可慢） */
function fakeGate(
  respond: (questions: GateQuestion[]) => unknown,
): { gate: DecisionGate; calls: GateQuestion[][] } {
  const calls: GateQuestion[][] = [];
  const gate: DecisionGate = {
    provider: 'llm-wrapper',
    evaluate(_state: GateState, questions: GateQuestion[]): Promise<GateResult[]> {
      calls.push(questions);
      return Promise.resolve(respond(questions) as GateResult[]);
    },
  };
  return { gate, calls };
}

function result(id: string, value: number | number[], confidence = 0.9): GateResult {
  const kind: GateQuestion['kind'] = Array.isArray(value) ? 'choice' : 'noul';
  return { id, kind, value, confidence, latencyMs: 12 };
}

describe('runUnifiedPrecheck — 打包与对齐', () => {
  it('全部问题正常返回：一次 evaluate 打包带全部问题，results 与 specs 同序', async () => {
    const { gate, calls } = fakeGate(() => [
      result('mood', 0.8),
      result('tone', [0.7, 0.3]),
      result('window', [0.2, 0.8]),
    ]);

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(calls).toHaveLength(1);
    expect(calls[0].map((q) => q.id)).toEqual(['mood', 'tone', 'window']);
    expect(out.fallbackUsed).toBe(false);
    expect(out.results.map((r) => r.id)).toEqual(['mood', 'tone', 'window']);
    expect(out.results[0].value).toBe(0.8);
    expect(out.results[1].value).toEqual([0.7, 0.3]);
    expect(out.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('gate 乱序返回：按 question.id 对齐回 specs 顺序', async () => {
    const { gate } = fakeGate(() => [
      result('window', [0.1, 0.9]),
      result('mood', 0.55),
      result('tone', [0.4, 0.6]),
    ]);

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(out.results.map((r) => r.id)).toEqual(['mood', 'tone', 'window']);
    expect(out.results[0].value).toBe(0.55);
    expect(out.results[1].value).toEqual([0.4, 0.6]);
    expect(out.results[2].value).toEqual([0.1, 0.9]);
    expect(out.fallbackUsed).toBe(false);
  });

  it('部分 id 缺失：漏答的落 {value:0, confidence:0}，其余不回位', async () => {
    const { gate } = fakeGate(() => [result('mood', 0.9)]);

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(out.results).toHaveLength(3);
    expect(out.results[0].value).toBe(0.9);
    for (const missing of out.results.slice(1)) {
      expect(missing.value).toBe(0);
      expect(missing.confidence).toBe(0);
    }
    // 漏答 ≠ 降级：gate 本身答了，只是没答全
    expect(out.fallbackUsed).toBe(false);
  });

  it('契约违约（返回非数组/重复 id/垃圾条目）：不抛，全部落 miss', async () => {
    const { gate } = fakeGate(() => [null, 'garbage', { id: 'mood' }, { nope: 1 }] as unknown);

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(out.fallbackUsed).toBe(false);
    expect(out.results.map((r) => r.id)).toEqual(['mood', 'tone', 'window']);
    expect(out.results.every((r) => r.value === 0 && r.confidence === 0)).toBe(true);
  });
});

describe('runUnifiedPrecheck — 降级纪律（语义层是 bonus 不是依赖）', () => {
  it('gate 抛异常：零异常冒泡，fallbackUsed=true 且 results 为空', async () => {
    const gate: DecisionGate = {
      provider: 'llm-wrapper',
      evaluate: () => Promise.reject(new Error('jev 503')),
    };

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(out.fallbackUsed).toBe(true);
    expect(out.results).toEqual([]);
    expect(out.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('gate 同步抛异常（async 关键字之前就炸）：同样零异常冒泡', async () => {
    const gate: DecisionGate = {
      provider: 'jev',
      evaluate: () => {
        throw new Error('未开通 waitlist');
      },
    };

    const out = await runUnifiedPrecheck(gate, STATE, SPECS);

    expect(out.fallbackUsed).toBe(true);
    expect(out.results).toEqual([]);
  });

  it('慢 gate + timeoutMs:50：超时即放弃，不等它回来', async () => {
    const slowGate: DecisionGate = {
      provider: 'jev',
      // 永不 resolve：只有超时臂能结束这次预检
      evaluate: () => new Promise<GateResult[]>(() => {}),
    };

    const out = await runUnifiedPrecheck(slowGate, STATE, SPECS, { timeoutMs: 50 });

    expect(out.fallbackUsed).toBe(true);
    expect(out.results).toEqual([]);
    expect(out.totalLatencyMs).toBeLessThan(3000);
  });

  it('慢 gate 在超时之后才 resolve：不产生 unhandledRejection 噪音', async () => {
    let settle: ((r: GateResult[]) => void) | undefined;
    const lateGate: DecisionGate = {
      provider: 'jev',
      evaluate: () =>
        new Promise<GateResult[]>((resolve) => {
          settle = resolve;
        }),
    };
    const warn = vi.spyOn(process, 'emitWarning');

    const out = await runUnifiedPrecheck(lateGate, STATE, SPECS, { timeoutMs: 20 });
    settle?.([result('mood', 1)]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(out.fallbackUsed).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('空 specs：不调闸（调用计数 0），results=[] 且不算降级', async () => {
    const { gate, calls } = fakeGate(() => []);

    const out = await runUnifiedPrecheck(gate, STATE, []);

    expect(calls).toHaveLength(0);
    expect(out.results).toEqual([]);
    expect(out.fallbackUsed).toBe(false);
  });
});

describe('PRECHECK_REGISTRY — 登记簿完整性（b128 口径 12 住 parts / 8 住 lib = 20）', () => {
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

  it('登记 20 条，12 住 parts / 8 住 lib', () => {
    expect(PRECHECK_REGISTRY).toHaveLength(PRECHECK_REGISTRY_SIZE);
    expect(PRECHECK_REGISTRY).toHaveLength(20);
    expect(PRECHECK_REGISTRY.filter((s) => s.source === 'parts')).toHaveLength(12);
    expect(PRECHECK_REGISTRY.filter((s) => s.source === 'lib')).toHaveLength(8);
  });

  it('每条 ruleRef 指向真实存在的文件（相对 repo 根）', () => {
    for (const spec of PRECHECK_REGISTRY) {
      expect(spec.ruleRef, `${spec.detectorId} 缺 ruleRef`).toBeTruthy();
      expect(existsSync(join(REPO_ROOT, spec.ruleRef as string)), `${spec.detectorId} → ${spec.ruleRef}`).toBe(
        true,
      );
    }
  });

  it('detectorId / question.id 全局唯一（无重复登记）', () => {
    const detectorIds = PRECHECK_REGISTRY.map((s) => s.detectorId);
    const questionIds = PRECHECK_REGISTRY.map((s) => s.question.id);
    expect(new Set(detectorIds).size).toBe(detectorIds.length);
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });

  it('每条 question 都是 Wave 0 的三型之一且 noul 必带 statement', () => {
    for (const spec of PRECHECK_REGISTRY) {
      const { kind } = spec.question;
      expect(['noul', 'choice', 'score']).toContain(kind);
      if (kind === 'noul') {
        expect(spec.question.statement, `${spec.detectorId} 的 noul 缺 statement`).toBeTruthy();
      }
      if (kind === 'choice') {
        expect(spec.question.options.length).toBeGreaterThan(0);
      }
    }
  });

  it('source 与 ruleRef 实际路径一致（登记簿不许指错地方）', () => {
    for (const spec of PRECHECK_REGISTRY) {
      const ref = spec.ruleRef as string;
      if (spec.source === 'parts') expect(ref, spec.detectorId).toContain('src/app/api/chat/parts/');
      else expect(ref, spec.detectorId).toMatch(/^src\/lib\//);
    }
  });

  it('未登记的两个单元单列在 WAVE1_OUT_OF_REGISTRY（合成器 + 非单轮）', () => {
    const outIds = WAVE1_OUT_OF_REGISTRY.map((e) => e.detectorId);
    expect(outIds).toEqual(['green-alt-retro-gate', 'follow-up-query']);
    for (const id of outIds) {
      expect(findPrecheckSpec(id)).toBeUndefined();
    }
    expect(findPrecheckSpec('emotion-shopping-detector')?.source).toBe('parts');
    expect(findPrecheckSpec('no-such-detector')).toBeUndefined();
  });

  it('默认超时预算 300ms（v2 方案 §2 延迟预算）', () => {
    expect(PRECHECK_DEFAULT_TIMEOUT_MS).toBe(300);
  });
});
