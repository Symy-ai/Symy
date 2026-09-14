/**
 * commitment-turn 测试 (batch53-a) — 命中时 canned 迎接 + 登记卡 payload 透传,
 * 未命中 null; SSE 流先发卡事件再分块 token 最后 done。
 */
import { describe, expect, it } from 'vitest';
import { buildCommitmentSseStream, buildCommitmentTurn, commitmentSseEvent } from '../commitment-turn';

const RNG = () => 0;

describe('buildCommitmentTurn', () => {
  it('命中: reply 非空 + 卡 payload 原样带检测意图', () => {
    const turn = buildCommitmentTurn({ userContent: '先忍 30 天不买游戏', locale: 'zh', rng: RNG });
    expect(turn).not.toBeNull();
    expect(turn!.reply.length).toBeGreaterThan(0);
    expect(turn!.commitmentCard).toEqual({ subject: '游戏', durationKind: 'fixed', days: 30 });
  });

  it('未命中 (疑问句/反驳/普通咨询): null', () => {
    expect(buildCommitmentTurn({ userContent: '这个月能不买咖啡吗', locale: 'zh', rng: RNG })).toBeNull();
    expect(buildCommitmentTurn({ userContent: '我就要买鞋', locale: 'zh', rng: RNG })).toBeNull();
    expect(buildCommitmentTurn({ userContent: '帮我找个包', locale: 'zh', rng: RNG })).toBeNull();
  });
});

describe('buildCommitmentSseStream', () => {
  it('首事件 commitment_card, 尾事件 done, 中间 token 分块', async () => {
    const turn = buildCommitmentTurn({ userContent: '这个月不买咖啡', locale: 'zh', rng: RNG })!;
    const stream = buildCommitmentSseStream(turn);
    const text = await new Response(stream).text();
    const lines = text.trim().split('\n\n').map((l) => JSON.parse(l.replace(/^data: /, '')));
    expect(lines[0]).toEqual(commitmentSseEvent(turn.commitmentCard));
    expect(lines[0].type).toBe('commitment_card');
    expect(lines[lines.length - 1]).toEqual({ type: 'done' });
    for (const line of lines.slice(1, -1)) {
      expect(line.type).toBe('token');
      expect(typeof line.content).toBe('string');
    }
  });
});
