/* eslint-disable require-await */
/**
 * batch48-a: 守护强度三档指令行注入 loadLettaTurnContext 的装配测试。
 *
 * 覆盖:
 * 1. strict / gentle → userContentWithStage 含对应 [GUARD INTENSITY: ...] 指令行
 * 2. balanced / undefined (缺省) → 不含 GUARD INTENSITY (prompt 与现状逐字节一致, AC2)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadLettaTurnContext } from '../letta-turn-context';

if (typeof globalThis.fetch !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
}

async function buildPrompt(guardIntensity?: 'gentle' | 'balanced' | 'strict') {
  const result = await loadLettaTurnContext({
    userId: undefined,
    supabase: null,
    userContent: 'msg',
    locale: 'zh',
    greenPref: 'on',
    guardIntensity,
    impulseContext: undefined,
    validChallengeContext: undefined,
    factsStore: undefined,
  });
  return result.userContentWithStage;
}

describe('loadLettaTurnContext — batch48-a guard intensity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strict: 注入严格守护指令行 (追问 + 24h 微挑战引导)', async () => {
    const prompt = await buildPrompt('strict');
    expect(prompt).toContain('[GUARD INTENSITY: strict');
    expect(prompt).toContain('24-hour micro challenge');
  });

  it('gentle: 注入点到为止指令行 (不追问不推挑战)', async () => {
    const prompt = await buildPrompt('gentle');
    expect(prompt).toContain('[GUARD INTENSITY: gentle');
    expect(prompt).toMatch(/NOT ask follow-up/);
  });

  it('三档产出互不相同', async () => {
    const [gentle, balanced, strict] = await Promise.all([
      buildPrompt('gentle'),
      buildPrompt('balanced'),
      buildPrompt('strict'),
    ]);
    expect(new Set([gentle, balanced, strict]).size).toBe(3);
  });

  it('balanced 与缺省 (undefined): 均不含 GUARD INTENSITY (现状逐字节一致)', async () => {
    expect(await buildPrompt('balanced')).not.toContain('GUARD INTENSITY');
    expect(await buildPrompt(undefined)).not.toContain('GUARD INTENSITY');
  });
});
