/**
 * list-triage-turn 测试 (batch57-a)
 *
 * 覆盖验收: 三态分诊 (词条命中替代 / 守护品类想清楚 / 其余绿灯) /
 * 53-b guard-scope exempt 品类静默放行 (归绿灯, 不追问不给替代) /
 * 合计纯计数 / 未命中消息返回 null / SSE 流形状 (事件先于 token)。
 */

import { describe, expect, it } from 'vitest';
import { buildListTriageTurn, buildListTriageSseStream } from '../list-triage-turn';
import { defaultGuardScope } from '@/lib/guard-scope';

describe('buildListTriageTurn 三态分诊', () => {
  it('混合清单: 奶茶→替代(词条), 跑鞋→想清楚(守护品类无词条), 新键盘→绿灯(非守护品类)', () => {
    const turn = buildListTriageTurn({
      userContent: '帮我看看这些：奶茶、跑鞋、新键盘',
      locale: 'zh',
      guardScope: defaultGuardScope(),
      rng: () => 0,
    });
    expect(turn).not.toBeNull();

    const [tea, shoes, keyboard] = turn!.listTriageCard.items;
    // 词条命中 → 替代 (只读引用 milk_tea 词条)
    expect(tea.verdict).toBe('alt');
    expect(tea.altId).toBe('milk_tea');
    expect(tea.why).toContain('奶茶');
    expect(tea.alternative).toBeTruthy();
    // 守护品类 (clothing) 无词条 → 想清楚
    expect(shoes.word).toBe('跑鞋');
    expect(shoes.verdict).toBe('think');
    expect(shoes.altId).toBeNull();
    // 非守护品类 → 绿灯
    expect(keyboard.verdict).toBe('green');
    expect(keyboard.altId).toBeNull();

    // 合计纯计数
    expect(turn!.listTriageCard.summary).toEqual({ total: 3, green: 1, alt: 1, think: 1 });
    // 迎接话术来自 elephant-tone list_triage_welcome
    expect(turn!.reply).toContain('本象');
  });

  it('exempt 品类静默放行: clothing 豁免后跑鞋归绿灯, 不追问不给替代 (53-b 语义)', () => {
    const turn = buildListTriageTurn({
      userContent: '帮我看看这些：奶茶、跑鞋、新键盘',
      locale: 'zh',
      guardScope: { ...defaultGuardScope(), clothing: 'exempt' },
      rng: () => 0,
    });
    const shoes = turn!.listTriageCard.items.find((i) => i.word === '跑鞋')!;
    expect(shoes.verdict).toBe('green');
    expect(shoes.altId).toBeNull();
    // exempt 不改变词条命中条目 (奶茶仍是替代)
    expect(turn!.listTriageCard.summary).toEqual({ total: 3, green: 2, alt: 1, think: 0 });
  });

  it('全绿灯清单: 无词条无守护品类 → 全放行, 合计 0/0', () => {
    const turn = buildListTriageTurn({
      userContent: '要买：新键盘、鼠标垫',
      locale: 'zh',
      guardScope: defaultGuardScope(),
      rng: () => 0,
    });
    expect(turn!.listTriageCard.items.every((i) => i.verdict === 'green')).toBe(true);
    expect(turn!.listTriageCard.summary).toEqual({ total: 2, green: 2, alt: 0, think: 0 });
  });

  it('en locale: 词条文案取 en', () => {
    const turn = buildListTriageTurn({
      userContent: 'Help me check these: milk tea',
      locale: 'en',
      guardScope: defaultGuardScope(),
      rng: () => 0,
    });
    // 单对象 → 不触发 (留给单对象流)
    expect(turn).toBeNull();
  });

  it('未命中消息 (单对象 / 已买回顾) 返回 null', () => {
    expect(buildListTriageTurn({ userContent: '我想买个键盘', locale: 'zh', guardScope: defaultGuardScope() })).toBeNull();
    expect(buildListTriageTurn({ userContent: '昨天买了奶茶、跑鞋，都到了', locale: 'zh', guardScope: defaultGuardScope() })).toBeNull();
  });
});

describe('buildListTriageSseStream', () => {
  it('先发 list_triage_card 事件再发 token, 最后 done', async () => {
    const turn = buildListTriageTurn({
      userContent: '帮我看看这些：奶茶、跑鞋',
      locale: 'zh',
      guardScope: defaultGuardScope(),
      rng: () => 0,
    })!;
    const stream = buildListTriageSseStream(turn);
    const text = await new Response(stream).text();
    const events = text.split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
    expect(events[0].type).toBe('list_triage_card');
    expect(events[0].listTriageCard.items.length).toBe(2);
    expect(events[events.length - 1].type).toBe('done');
    expect(events.slice(1, -1).every((e) => e.type === 'token')).toBe(true);
  });
});
