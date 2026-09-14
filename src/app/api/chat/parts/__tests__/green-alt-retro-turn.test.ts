/**
 * green-alt-retro-turn 测试 — 追问轮/收束轮 builder + SSE 事件序 + 链序锁 (batch68-a)
 *
 * 覆盖: 追问轮承认选择且零金额; 4 选项卡 payload 固定顺序; 未知词条静默 null;
 * 选项收束轮逐项产出身份叙事文案 (零金额零碳); SSE 事件序 (green_alt_retro
 * 最前 → tokens → done); zh/en 双语文案齐全; route.ts source-order — 回答块
 * 与追问块在链首 (reflection 之前、loadLettaTurnContext 之前), gate 在块内。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildGreenAltRetroAskSseStream,
  buildGreenAltRetroAskTurn,
  buildGreenAltRetroClosingSseStream,
  buildGreenAltRetroClosingTurn,
} from '../green-alt-retro-turn';
import { GREEN_ALT_RETRO_OPTIONS } from '@/lib/green-alt-retro';
import enMessages from '@/i18n/messages/en.json';
import zhMessages from '@/i18n/messages/zh.json';

async function readStream(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('buildGreenAltRetroAskTurn — 追问轮', () => {
  it('承认刚完成的选择 + 附 4 选项卡 payload', () => {
    for (const locale of ['zh', 'en'] as const) {
      const turn = buildGreenAltRetroAskTurn({ entryId: 'milk_tea', locale });
      expect(turn).not.toBeNull();
      expect(turn!.reply.length).toBeGreaterThan(0);
      expect(turn!.greenAltRetro).toEqual({ entryId: 'milk_tea', options: [...GREEN_ALT_RETRO_OPTIONS] });
    }
  });

  it('zh 插入词条显示名; en 全英文', () => {
    expect(buildGreenAltRetroAskTurn({ entryId: 'milk_tea', locale: 'zh' })!.reply).toContain('奶茶');
    expect(buildGreenAltRetroAskTurn({ entryId: 'milk_tea', locale: 'en' })!.reply).toMatch(/^[A-Za-z]/);
  });

  it('追问话术零金额零碳数值', () => {
    for (const locale of ['zh', 'en'] as const) {
      const reply = buildGreenAltRetroAskTurn({ entryId: 'milk_tea', locale })!.reply;
      expect(reply).not.toMatch(/\$\s?\d|\d+\s*元|¥\s?\d|碳|carbon|\bkg\b/i);
    }
  });

  it('未知词条 → null (静默回落普通链路)', () => {
    expect(buildGreenAltRetroAskTurn({ entryId: 'no-such-entry', locale: 'zh' })).toBeNull();
  });
});

describe('buildGreenAltRetroClosingTurn — 选项收束轮', () => {
  it('四个选项各产出一句收束确认 (身份叙事, 不追问)', () => {
    for (const optionId of GREEN_ALT_RETRO_OPTIONS) {
      for (const locale of ['zh', 'en'] as const) {
        const turn = buildGreenAltRetroClosingTurn({ entryId: 'milk_tea', optionId, locale });
        expect(turn).not.toBeNull();
        expect(turn!.reply.length).toBeGreaterThan(6);
        // 无羞辱/无经济状况暗示: 不出现指责与借贷话术
        expect(turn!.reply).not.toMatch(/又|总是|浪费|可惜|穷|买不起|waste|always|can'?t afford|shame/i);
      }
    }
  });

  it('收束文案零金额零碳数值', () => {
    for (const optionId of GREEN_ALT_RETRO_OPTIONS) {
      for (const locale of ['zh', 'en'] as const) {
        const reply = buildGreenAltRetroClosingTurn({ entryId: 'milk_tea', optionId, locale })!.reply;
        expect(reply).not.toMatch(/\$\s?\d|\d+\s*元|¥\s?\d|碳足迹|carbon footprint/i);
      }
    }
  });

  it('非法词条/非法选项 → null', () => {
    expect(buildGreenAltRetroClosingTurn({ entryId: 'nope', optionId: 'already_have', locale: 'zh' })).toBeNull();
    expect(buildGreenAltRetroClosingTurn({ entryId: 'milk_tea', optionId: 'not_now' as never, locale: 'zh' })).toBeNull();
  });
});

describe('SSE 事件序', () => {
  it('追问轮: green_alt_retro 事件在最前, 之后 tokens, 最后 done', async () => {
    const turn = buildGreenAltRetroAskTurn({ entryId: 'milk_tea', locale: 'zh' })!;
    const events = await readStream(buildGreenAltRetroAskSseStream(turn));
    expect(events[0]).toMatchObject({ type: 'green_alt_retro', greenAltRetro: { entryId: 'milk_tea' } });
    expect(events.filter((e) => (e as { type: string }).type === 'token').length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });
  });

  it('收束轮: 纯 token + done, 无卡片事件', async () => {
    const turn = buildGreenAltRetroClosingTurn({ entryId: 'milk_tea', optionId: 'already_have', locale: 'zh' })!;
    const events = await readStream(buildGreenAltRetroClosingSseStream(turn));
    expect((events[0] as { type: string }).type).toBe('token');
    expect(events.some((e) => String((e as { type?: string }).type).includes('card'))).toBe(false);
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });
  });
});

describe('i18n — zh/en 全量文案齐全 (无 defaultValue 兜底)', () => {
  it('chat.greenAltRetro 结构对称且非空', () => {
    const keys = ['askReply', 'askTitle', 'freeTextHint', 'dismiss', 'answeredNote'] as const;
    for (const locale of [{ m: zhMessages }, { m: enMessages }]) {
      const retro = (locale.m.chat as unknown as Record<string, Record<string, unknown>>).greenAltRetro;
      for (const key of keys) expect(typeof retro[key]).toBe('string');
      for (const optionId of GREEN_ALT_RETRO_OPTIONS) {
        expect(typeof (retro.option as Record<string, string>)[optionId]).toBe('string');
        expect(typeof (retro.closing as Record<string, string>)[optionId]).toBe('string');
      }
    }
  });

  it('zh 选项即产品要求的 4 个非羞辱选项', () => {
    const retro = (zhMessages.chat as unknown as Record<string, { option: Record<string, string> }>).greenAltRetro;
    expect(retro.option.already_have).toBe('手头已有');
    expect(retro.option.rent_borrow).toBe('租借更省事');
    expect(retro.option.try_once).toBe('先试一次');
    expect(retro.option.reduce_idle).toBe('想减少闲置');
  });
});

// ============================================================
// route.ts source-order 链序锁 — 回答块/追问块在链首
// ============================================================

describe('路由链序锁 — 复盘回答块与追问块在链首 (source-order)', () => {
  const source = readFileSync(new URL('../../route.ts', import.meta.url), 'utf-8');

  it('回答块先于追问块, 追问块先于 reflection canned (采纳后下一轮即问, 收束不被截胡)', () => {
    const answerIdx = source.indexOf('buildGreenAltRetroClosingTurn');
    const askIdx = source.indexOf('buildGreenAltRetroAskTurn');
    const reflectionIdx = source.indexOf('isReflectionQuestion');
    expect(answerIdx).toBeGreaterThan(-1);
    expect(askIdx).toBeGreaterThan(answerIdx);
    expect(reflectionIdx).toBeGreaterThan(askIdx);
  });

  it('复盘两块都早于 loadLettaTurnContext (自由文本回答回落 Letta 在后)', () => {
    const callIdx = source.indexOf('await loadLettaTurnContext({');
    expect(callIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(source.indexOf('buildGreenAltRetroAskTurn'));
    expect(callIdx).toBeGreaterThan(source.indexOf('buildGreenAltRetroClosingTurn'));
  });

  it('回答块与追问块都经过让位 gate (新购买/紧急/数据问句不触发)', () => {
    const answerBlock = source.slice(
      source.indexOf('batch68-a 绿色采纳后复盘 — 回答轮'),
      source.indexOf('batch68-a 复盘追问轮'),
    );
    const askBlock = source.slice(
      source.indexOf('batch68-a 复盘追问轮'),
      source.indexOf('isReflectionQuestion'),
    );
    expect(answerBlock).toMatch(/shouldDeferGreenAltRetro/);
    expect(answerBlock).not.toMatch(/greenAltRetroPending/);
    expect(askBlock).toMatch(/shouldDeferGreenAltRetro/);
    expect(askBlock).toMatch(/greenPref !== 'off'/);
  });

  it('追问块 greenPref off 整体静默 (拒绝守护的会话不追问)', () => {
    const block = source.slice(
      source.indexOf('batch68-a 复盘追问轮'),
      source.indexOf('isReflectionQuestion'),
    );
    expect(block.indexOf("greenPref !== 'off'")).toBeGreaterThan(-1);
    expect(block.indexOf("greenPref !== 'off'")).toBeLessThan(block.indexOf('buildGreenAltRetroAskTurn'));
  });
});
