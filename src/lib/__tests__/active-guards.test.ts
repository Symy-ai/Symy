/**
 * aggregateActiveGuards 测试 — 进行中守护面板纯聚合 (batch59-a)
 *
 * 覆盖: 混合三类; 已过期项不出现 (挑战过 24h / 承诺 end_key 已过 / 冷静期 7 天
 * 僵尸线); 无数据空态; 时区边界 (end_key 当日仍算 active, 次日移出);
 * 去重 (同窗承诺登记两条 / 助攻按 triggerId 去重); 坚持天数口径。
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateActiveGuards,
  CHALLENGE_WINDOW_MS,
  COOLDOWN_STALE_MS,
  type ActiveGuardsEventInput,
} from '../active-guards';
import { buildActiveGuardsShareData } from '../active-guards-share';
import { buildGuardSosTurn } from '../guard-sos';
import zhMessages from '../../i18n/messages/zh.json';
import enMessages from '../../i18n/messages/en.json';

const NOW = new Date(2026, 8, 9, 12); // 2026-09-09 12:00 本地

function commitmentEvent(over: Partial<ActiveGuardsEventInput> = {}): ActiveGuardsEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerId: null,
    metadata: {
      source: 'green_commitment',
      category: 'food',
      subject: '外卖',
      start_key: '2026-09-01',
      end_key: '2026-09-30',
    },
    createdAt: new Date(2026, 8, 1, 9).toISOString(),
    ...over,
  };
}

function assistEvent(triggerId: string, savedAmount: number): ActiveGuardsEventInput {
  return {
    eventType: 'challenge_completed',
    triggerId,
    metadata: { category: 'food', savedAmount },
    createdAt: new Date(2026, 8, 5, 20).toISOString(),
  };
}

describe('aggregateActiveGuards', () => {
  it('混合三类: 挑战 + 承诺 + 冷静期均出现, 各带剩余时间与私享金额', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: { id: 'c1', itemName: '耳机', amount: 299, createdAt: new Date(2026, 8, 9, 6).toISOString() },
      events: [commitmentEvent(), assistEvent('t1', 35), assistEvent('t2', 20)],
      cooldown: { subject: '跑鞋', askedAt: NOW.getTime() - 6 * 3600000, dueAt: NOW.getTime() + 18 * 3600000, amount: 400 },
    });

    expect(summary.status).toBe('ok');
    expect(summary.totalCount).toBe(3);

    expect(summary.challenges.length).toBe(1);
    expect(summary.challenges[0].itemName).toBe('耳机');
    expect(summary.challenges[0].guardedAmount).toBe(299);
    expect(summary.challenges[0].hoursLeft).toBeCloseTo(18, 5);

    expect(summary.commitments.length).toBe(1);
    expect(summary.commitments[0].daysLeft).toBe(21);
    expect(summary.commitments[0].assistCount).toBe(2);
    expect(summary.commitments[0].assistSaved).toBe(55);

    expect(summary.cooldowns.length).toBe(1);
    expect(summary.cooldowns[0].hoursLeft).toBeCloseTo(18, 5);
    expect(summary.cooldowns[0].dueForRevisit).toBe(false);

    // 坚持天数: 最早 active 项发起日 2026-09-01 → 09-09, 含尾 9 天
    expect(summary.persistDays).toBe(9);
  });

  it('已过期项不出现: 挑战过 24h 窗口 / 承诺 end_key 已过 / 冷静期超 7 天僵尸线', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: { id: 'c1', itemName: '旧耳机', amount: 100, createdAt: new Date(NOW.getTime() - CHALLENGE_WINDOW_MS - 1000).toISOString() },
      events: [commitmentEvent({ metadata: { source: 'green_commitment', category: 'food', subject: '外卖', start_key: '2026-08-01', end_key: '2026-08-31' } })],
      cooldown: { subject: '旧跑鞋', askedAt: NOW.getTime() - 8 * 24 * 3600000, dueAt: NOW.getTime() - COOLDOWN_STALE_MS - 1000, amount: 300 },
    });

    expect(summary.challenges.length).toBe(0);
    expect(summary.commitments.length).toBe(0);
    expect(summary.cooldowns.length).toBe(0);
    expect(summary.status).toBe('empty');
    expect(summary.totalCount).toBe(0);
  });

  it('无数据空态', () => {
    const summary = aggregateActiveGuards({ now: NOW, challenge: null, events: [], cooldown: null });
    expect(summary.status).toBe('empty');
    expect(summary.persistDays).toBe(0);
  });

  it('时区边界: end_key 当日仍算 active (剩余 0 天), 次日移出', () => {
    const todayEnd = commitmentEvent({ metadata: { source: 'green_commitment', category: 'food', subject: '外卖', start_key: '2026-09-01', end_key: '2026-09-09' } });
    const today = aggregateActiveGuards({ now: NOW, challenge: null, events: [todayEnd], cooldown: null });
    expect(today.commitments.length).toBe(1);
    expect(today.commitments[0].daysLeft).toBe(0);

    const tomorrow = aggregateActiveGuards({
      now: new Date(2026, 8, 10, 8),
      challenge: null,
      events: [todayEnd],
      cooldown: null,
    });
    expect(tomorrow.commitments.length).toBe(0);
  });

  it('去重: 同窗承诺登记两条只算一件; 助攻按 triggerId 去重', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: null,
      events: [commitmentEvent(), commitmentEvent({ createdAt: new Date(2026, 8, 2, 9).toISOString() }), assistEvent('t1', 35), assistEvent('t1', 999)],
      cooldown: null,
    });

    expect(summary.commitments.length).toBe(1);
    expect(summary.commitments[0].assistCount).toBe(1);
    expect(summary.commitments[0].assistSaved).toBe(35);
  });

  it('助攻窗口外/品类不匹配不计入', () => {
    const outOfWindow = assistEvent('t0', 50);
    outOfWindow.createdAt = new Date(2026, 7, 15, 20).toISOString(); // 08-15, 窗口前
    const otherCategory: ActiveGuardsEventInput = {
      eventType: 'challenge_completed',
      triggerId: 't9',
      metadata: { category: 'clothing', savedAmount: 200 },
      createdAt: new Date(2026, 8, 5, 21).toISOString(),
    };
    const summary = aggregateActiveGuards({ now: NOW, challenge: null, events: [commitmentEvent(), outOfWindow, otherCategory], cooldown: null });
    expect(summary.commitments[0].assistCount).toBe(0);
    expect(summary.commitments[0].assistSaved).toBe(0);
  });

  it('冷静期到期待回访: dueForRevisit=true 仍是 active 项', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: null,
      events: [],
      cooldown: { subject: '跑鞋', askedAt: NOW.getTime() - 30 * 3600000, dueAt: NOW.getTime() - 6 * 3600000, amount: null },
    });
    expect(summary.cooldowns.length).toBe(1);
    expect(summary.cooldowns[0].dueForRevisit).toBe(true);
    expect(summary.cooldowns[0].hoursLeft).toBe(0);
  });

  it('坏输入防御性跳过: 无效 createdAt 挑战 / 坏日期键承诺', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: { id: 'c1', itemName: 'x', amount: 10, createdAt: 'not-a-date' },
      events: [commitmentEvent({ metadata: { source: 'green_commitment', start_key: 'bad', end_key: '2026-09-30' } })],
      cooldown: null,
    });
    expect(summary.status).toBe('empty');
  });
});

describe('红线: 分享面结构性 amount-free', () => {
  it('buildActiveGuardsShareData 输出无金额字段/金额值 (输入带金额)', () => {
    const summary = aggregateActiveGuards({
      now: NOW,
      challenge: { id: 'c1', itemName: '耳机', amount: 299, createdAt: new Date(2026, 8, 9, 6).toISOString() },
      events: [commitmentEvent(), assistEvent('t1', 35)],
      cooldown: { subject: '跑鞋', askedAt: NOW.getTime() - 3600000, dueAt: NOW.getTime() + 23 * 3600000, amount: 400 },
    });
    const share = buildActiveGuardsShareData(summary);
    const json = JSON.stringify(share);
    expect(json).not.toMatch(/amount|estSaved|saved/i);
    // 私享金额值本身 (299/400/35) 不出现
    expect(json).not.toContain('299');
    expect(json).not.toContain('400');
    expect(share.totalCount).toBe(3);
    expect(share.persistDays).toBeGreaterThan(0);
    expect(share.categoryNames.length).toBeGreaterThan(0);
  });
});

describe('buildGuardSosTurn', () => {
  it('三档引导行 + 固定三回应; hold 档小时向上取整', () => {
    for (const intensity of ['gentle', 'balanced', 'strict'] as const) {
      const turn = buildGuardSosTurn(intensity, 2.5);
      expect(turn.leadKey).toBe(`chat.activeGuards.sos.lead.${intensity}`);
      expect(turn.options.map((o) => o.id)).toEqual(['hold', 'alt', 'release']);
      expect(turn.hoursLeft).toBe(3);
    }
    expect(buildGuardSosTurn('balanced', 0).hoursLeft).toBe(1);
  });
});

describe('红线: SOS 话术非羞辱 (zh/en 文案层)', () => {
  const zh = zhMessages;
  const en = enMessages;

  it('activeGuards.sos 子树禁「失败/浪费/没忍住」类羞辱词', () => {
    const forbidden = [/失败/, /浪费/, /没忍住/, /又不/, /羞耻/, /丢人/, /fail/i, /waste/i, /couldn'?t resist/i, /shame/i];
    for (const messages of [zh, en]) {
      const sos = (messages as { chat: { activeGuards: { sos: unknown } } }).chat.activeGuards.sos;
      const text = JSON.stringify(sos);
      for (const re of forbidden) {
        expect(re.test(text), `sos copy shames: ${re}`).toBe(false);
      }
    }
  });

  it('activeGuards.sos 子树零金额/零碳数值', () => {
    const noMoney = /¥|\$|¥\d|kg|CO2/i;
    for (const messages of [zh, en]) {
      const sos = (messages as { chat: { activeGuards: { sos: unknown } } }).chat.activeGuards.sos;
      expect(noMoney.test(JSON.stringify(sos))).toBe(false);
    }
  });
});
