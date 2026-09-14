/**
 * cooldown-turn 测试 — 反驳降温轮 (batch48-b)
 *
 * 覆盖:
 * 1. afterGuardCard + 反驳意图 → canned 降温回复 + 冷静卡
 * 2. 普通咨询 / 无守护卡 → null (不误触发)
 * 3. 话术红线: 无第二次拦截词、无羞辱回溯、无金额、无碳数值 (tone guard)
 * 4. SSE 流形状: cooldown_card 事件在最前, token 分块, done 结尾
 */

import { describe, expect, it } from 'vitest';
import {
  buildCooldownSseStream,
  buildCooldownTurn,
} from '../cooldown-turn';
import { ELEPHANT_PHRASES } from '@/lib/elephant-tone';

const rng = () => 0; // 确定性取第一个变体

describe('buildCooldownTurn 命中', () => {
  it('zh 反驳 → 降温回复 + 冷静卡 (品类识别)', () => {
    const turn = buildCooldownTurn({ userContent: '我就要买这件衣服', locale: 'zh', afterGuardCard: true, rng });
    expect(turn).not.toBeNull();
    expect(turn!.tone).toBe('firm');
    expect(turn!.reply).toBe(ELEPHANT_PHRASES.cooldown_stepback.zh[0]);
    expect(turn!.cooldownCard).toEqual({ category: 'clothing' });
  });

  it('en 不耐烦 → annoyed 档话术', () => {
    const turn = buildCooldownTurn({ userContent: 'leave me alone, so annoying', locale: 'en', afterGuardCard: true, rng });
    expect(turn!.tone).toBe('annoyed');
    expect(turn!.reply).toBe(ELEPHANT_PHRASES.cooldown_stepback_annoyed.en[0]);
    // 识别不出品类 → null (卡片用通用文案)
    expect(turn!.cooldownCard).toEqual({ category: null });
  });
});

describe('buildCooldownTurn 不命中 (负例)', () => {
  it('上一轮无守护卡 → 不触发 (即使含反驳词)', () => {
    expect(buildCooldownTurn({ userContent: '我就要买', locale: 'zh', afterGuardCard: false, rng })).toBeNull();
  });

  it('普通商品咨询不误触发', () => {
    expect(buildCooldownTurn({ userContent: '帮我对比 A 和 B', locale: 'zh', afterGuardCard: true, rng })).toBeNull();
    expect(buildCooldownTurn({ userContent: 'I want a headphone recommendation', locale: 'en', afterGuardCard: true, rng })).toBeNull();
  });
});

describe('降温话术红线 (tone guard)', () => {
  const allPhrases = [
    ...ELEPHANT_PHRASES.cooldown_stepback.en,
    ...ELEPHANT_PHRASES.cooldown_stepback.zh,
    ...ELEPHANT_PHRASES.cooldown_stepback_annoyed.en,
    ...ELEPHANT_PHRASES.cooldown_stepback_annoyed.zh,
  ];

  it('无第二次拦截词 (不说教不重复拦截)', () => {
    const forbidden = [/别买/, /不要买/, /再想想/, /忍一忍/, /省下/, /don'?t buy/i, /reconsider/i, /think twice/i, /hold off/i];
    for (const p of allPhrases) {
      for (const re of forbidden) {
        expect(re.test(p), `cooldown phrase violates: "${p}"`).toBe(false);
      }
    }
  });

  it('无羞辱回溯 (不提上次失败)', () => {
    const forbidden = [/上次/, /没忍住/, /又失败/, /last time you/, /you failed/, /you couldn'?t resist/i];
    for (const p of allPhrases) {
      for (const re of forbidden) {
        expect(re.test(p), `cooldown phrase shames: "${p}"`).toBe(false);
      }
    }
  });

  it('无金额、无碳数值', () => {
    for (const p of allPhrases) {
      expect(p).not.toMatch(/\$|\¥|kg|CO2/i);
    }
  });
});

describe('buildCooldownSseStream 流形状', () => {
  async function readAll(stream: ReadableStream<Uint8Array>): Promise<{ type?: string; content?: string; cooldownCard?: unknown }[]> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    return raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)) as { type?: string; content?: string; cooldownCard?: unknown });
  }

  it('cooldown_card 事件在最前, token 分块拼回完整回复, done 结尾', async () => {
    const turn = buildCooldownTurn({ userContent: '我就要买这件衣服', locale: 'zh', afterGuardCard: true, rng })!;
    const events = await readAll(buildCooldownSseStream(turn));

    expect(events[0]).toEqual({ type: 'cooldown_card', cooldownCard: { category: 'clothing' } });
    const tokens = events.filter((e) => e.type === 'token').map((e) => e.content);
    expect(tokens.join('')).toBe(turn.reply);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    // 不出现第二次拦截事件 (无 green_alt / reuse_hint / micro_challenge)
    expect(events.some((e) => e.type === 'green_alt' || e.type === 'reuse_hint' || e.type === 'micro_challenge')).toBe(false);
  });
});
