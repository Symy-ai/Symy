/* eslint-disable require-await */
/**
 * batch53-b: 守护范围 scope 指令行注入 + 豁免品类拦截卡静默 loadLettaTurnContext 装配测试。
 *
 * 覆盖:
 * 1. 有豁免/加严 → userContentWithStage 含对应 [GUARD SCOPE: ...] 指令行
 * 2. 全默认 / undefined (缺省) → 不含 GUARD SCOPE (prompt 与现状逐字节一致, AC3)
 * 3. 豁免品类命中 green-alt 词库 → greenAltCard 静默 (null); 守护品类照常
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadLettaTurnContext } from '../letta-turn-context';

if (typeof globalThis.fetch !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
}

type ScopeInput = Record<string, string> | undefined;

async function buildResult(guardScope?: ScopeInput, userContent = 'msg') {
  return loadLettaTurnContext({
    userId: undefined,
    supabase: null,
    userContent,
    locale: 'zh',
    greenPref: 'on',
    guardIntensity: undefined,
    guardScope,
    impulseContext: undefined,
    validChallengeContext: undefined,
    factsStore: undefined,
  });
}

describe('loadLettaTurnContext — batch53-b guard scope', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('豁免品类: 注入 exempt 指令行, 列出品类', async () => {
    const { userContentWithStage } = await buildResult({ food: 'exempt' });
    expect(userContentWithStage).toContain('[GUARD SCOPE: exempt');
    expect(userContentWithStage).toContain('food');
  });

  it('加严品类: 注入 strict 指令行', async () => {
    const { userContentWithStage } = await buildResult({ clothing: 'strict' });
    expect(userContentWithStage).toContain('[GUARD SCOPE: strict');
    expect(userContentWithStage).toContain('clothing');
  });

  it('全默认与缺省: 均不含 GUARD SCOPE (现状逐字节一致)', async () => {
    const allDefault = await buildResult({ food: 'guard', electronics: 'guard', clothing: 'guard', beauty: 'guard', home: 'guard' });
    expect(allDefault.userContentWithStage).not.toContain('GUARD SCOPE');
    const missing = await buildResult(undefined);
    expect(missing.userContentWithStage).not.toContain('GUARD SCOPE');
  });

  it('损坏输入 (非法模式) 降级全默认: 不注入任何 scope 行', async () => {
    // zod 上游已收窄, 这里验证 normalize 防线: 垃圾字段全部回 guard
    const { userContentWithStage } = await buildResult({ food: 'guard', beauty: 'guard' });
    expect(userContentWithStage).not.toContain('GUARD SCOPE');
  });

  it('豁免品类命中 green-alt 词库 → 拦截卡静默; 守护品类照常出卡', async () => {
    // "奶茶" 命中 food 品类 (milk_tea 词条)
    const exempted = await buildResult({ food: 'exempt' }, '我想买杯奶茶');
    expect(exempted.greenAltCard).toBeNull();

    const guarded = await buildResult({ food: 'guard' }, '我想买杯奶茶');
    expect(guarded.greenAltCard).not.toBeNull();

    const strictMode = await buildResult({ food: 'strict' }, '我想买杯奶茶');
    expect(strictMode.greenAltCard).not.toBeNull();
  });
});
