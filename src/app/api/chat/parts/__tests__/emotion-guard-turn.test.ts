/**
 * emotion-guard-turn 测试 — 情绪守护轮构建 + 路由链序锁 (batch60-c)
 *
 * 覆盖: turn 形状 (mood + 档位归一); elephant-tone 共情话术红线 (无羞辱无
 * 禁买措辞); SSE 流事件序 (卡片最前 → tokens → done); payload 零金额零物品名;
 * route.ts source-order — 情绪块排在数据问答之后 (更高优先级规则优先)、
 * loadLettaTurnContext (BNPL/green/reuse/micro 通用购买预检) 之前。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEmotionGuardTurn, buildEmotionGuardSseStream, emotionGuardSseEvent } from '../emotion-guard-turn';
import { ELEPHANT_SCENES } from '@/lib/elephant-tone';
import type { EmotionGuardCardData } from '@/types/emotion-guard';

async function readStream(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('buildEmotionGuardTurn', () => {
  it('zh 验收样例命中 → 共情回复 + 守护卡 (tired)', () => {
    const turn = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh' });
    expect(turn).not.toBeNull();
    expect(turn!.emotionGuardCard).toEqual({ mood: 'tired', intensity: 'balanced' });
    expect(typeof turn!.reply).toBe('string');
    expect(turn!.reply.length).toBeGreaterThan(0);
  });

  it('en 验收样例命中 → mood=tired', () => {
    const turn = buildEmotionGuardTurn({ userContent: 'rough day, I want to treat myself', locale: 'en' });
    expect(turn?.emotionGuardCard.mood).toBe('tired');
  });

  it('单条件不命中 → null (继续既有路由)', () => {
    expect(buildEmotionGuardTurn({ userContent: '今天好累', locale: 'zh' })).toBeNull();
    expect(buildEmotionGuardTurn({ userContent: '想买耳机', locale: 'zh' })).toBeNull();
  });

  it('守护强度档位透传并归一 (gentle/strict/损坏值→balanced)', () => {
    const gentle = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh', guardIntensity: 'gentle' });
    expect(gentle?.emotionGuardCard.intensity).toBe('gentle');
    const strict = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh', guardIntensity: 'strict' });
    expect(strict?.emotionGuardCard.intensity).toBe('strict');
    const broken = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh', guardIntensity: 'bogus' });
    expect(broken?.emotionGuardCard.intensity).toBe('balanced');
  });

  it('话术红线: 共情回复无羞辱、无「别买/不能买」措辞 (zh+en 全变体)', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (let i = 0; i < 3; i += 1) {
        const turn = buildEmotionGuardTurn({
          userContent: '今天好累，想买点东西哄自己',
          locale,
          rng: () => i / 3,
        });
        expect(turn).not.toBeNull();
        expect(turn!.reply).not.toMatch(/别买|不能买|不许买|不该买|羞|可耻|浪费钱/);
        expect(turn!.reply).not.toMatch(/shouldn'?t buy|can'?t buy|not allowed|forbidden|waste of money|ashamed/i);
      }
    }
  });

  it('emotion_guard_welcome 场景已注册 (elephant-tone SSOT)', () => {
    expect(ELEPHANT_SCENES).toContain('emotion_guard_welcome');
  });
});

describe('emotionGuardSseEvent / buildEmotionGuardSseStream', () => {
  it('SSE 事件序: emotion_guard_card 最前 → token 分块 → done', async () => {
    const turn = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh', rng: () => 0 })!;
    const events = await readStream(buildEmotionGuardSseStream(turn));

    expect(events[0]).toEqual({ type: 'emotion_guard_card', emotionGuardCard: turn.emotionGuardCard });
    expect(emotionGuardSseEvent(turn.emotionGuardCard).type).toBe('emotion_guard_card');
    const tokens = events.slice(1, -1) as Array<{ type: string; content?: string }>;
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((e) => e.type === 'token')).toBe(true);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    // 回复完整 (分块拼回原文)
    expect(tokens.map((e) => e.content ?? '').join('')).toBe(turn.reply);
  });

  it('payload 红线: 守护卡只有 mood+intensity, 零金额零物品名字段', () => {
    const turn = buildEmotionGuardTurn({ userContent: '今天好累，想买点东西哄自己', locale: 'zh' })!;
    const keys = Object.keys(turn.emotionGuardCard).sort();
    expect(keys).toEqual(['intensity', 'mood']);
    expect(JSON.stringify(turn.emotionGuardCard)).not.toMatch(/amount|price|\d/);
  });
});

describe('路由链序锁 — 情绪守护块在数据问答之后、通用购买预检之前 (source-order)', () => {
  const source = readFileSync(new URL('../../route.ts', import.meta.url), 'utf-8');

  it('emotion 块晚于 57-c/58-c 数据问答检测 (更高优先级规则先答)', () => {
    const emotionIdx = source.indexOf('buildEmotionGuardTurn');
    expect(emotionIdx).toBeGreaterThan(-1);
    expect(source.indexOf('detectSavingsQuery')).toBeLessThan(emotionIdx);
    expect(source.indexOf('detectCategoryQuery')).toBeLessThan(emotionIdx);
    expect(source.indexOf('detectImpulseTimeQuery')).toBeLessThan(emotionIdx);
    expect(source.indexOf('detectFollowUpQuery')).toBeLessThan(emotionIdx);
  });

  it('emotion 块早于 loadLettaTurnContext 调用点 (BNPL/green/reuse/micro 通用购买预检之前)', () => {
    const emotionIdx = source.indexOf('buildEmotionGuardTurn');
    // 顶部 import 语句不算 — 只认 loadLettaTurnContext 的实际调用点
    const callIdx = source.indexOf('await loadLettaTurnContext({');
    expect(callIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(emotionIdx);
  });

  it('emotion 块自带三选项卡, 复用既有 SSE canned 流模式 (卡片事件 + canned reply)', () => {
    const turnFile = readFileSync(new URL('../emotion-guard-turn.ts', import.meta.url), 'utf-8');
    expect(turnFile).toContain("type: 'emotion_guard_card'");
  });
});

describe('EmotionGuardCardData 契约', () => {
  it('payload 与 SSE 事件共用同一形状 (消费端最小校验字段齐全)', () => {
    const card: EmotionGuardCardData = { mood: 'tired', intensity: 'balanced' };
    expect(typeof card.mood).toBe('string');
    expect(typeof card.intensity).toBe('string');
  });
});
