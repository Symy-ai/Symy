/**
 * parseTelegramWebhook — 外部报文解析契约
 * zod loose：未知字段容忍（Telegram 加字段不炸）；只消费字段强类型。
 */
import { describe, expect, it } from 'vitest';
import { parseTelegramWebhook } from '../parse';

const req = { headers: new Headers() };

function updateJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    update_id: 8001,
    message: {
      message_id: 42,
      from: { id: 9001, is_bot: false, first_name: 'QA', language_code: 'zh-CN' },
      chat: { id: 9001, type: 'private' },
      date: 1761000000,
      text: '帮我参谋要不要买冲锋衣',
    },
    ...overrides,
  });
}

describe('parseTelegramWebhook', () => {
  it('private 文本消息 → 单条 InboundMessage, 字段映射完整', () => {
    const [msg] = parseTelegramWebhook(req, updateJson());
    expect(msg).toEqual({
      platform: 'telegram',
      platformUserId: '9001',
      chatRef: '9001',
      text: '帮我参谋要不要买冲锋衣',
      dedupId: '8001',
      languageHint: 'zh-CN',
      kind: 'text',
    });
  });

  it('未知字段容忍 (loose) — Telegram 加字段不炸', () => {
    const raw = updateJson({ extra_top: { x: 1 } });
    const parsed = updateJson(); // message 内 extra 在下方单独注入
    const withExtra = JSON.parse(parsed);
    withExtra.message.extra_nested = { unknown: true };
    const [msg] = parseTelegramWebhook(req, JSON.stringify(withExtra));
    expect(msg?.kind).toBe('text');
    expect(raw.length).toBeGreaterThan(0);
  });

  it('/start → kind=command_start', () => {
    const withStart = JSON.parse(updateJson());
    withStart.message.text = '/start';
    const [msg] = parseTelegramWebhook(req, JSON.stringify(withStart));
    expect(msg?.kind).toBe('command_start');
  });

  it('/start ABCD2345 → command_start_payload + payload', () => {
    const withPayload = JSON.parse(updateJson());
    withPayload.message.text = '/start ABCD2345';
    const [msg] = parseTelegramWebhook(req, JSON.stringify(withPayload));
    expect(msg?.kind).toBe('command_start_payload');
    expect(msg?.startPayload).toBe('ABCD2345');
  });

  it('/start 非法 payload → text', () => {
    const invalid = JSON.parse(updateJson());
    invalid.message.text = '/start 0O1Iabc';
    const [msg] = parseTelegramWebhook(req, JSON.stringify(invalid));
    expect(msg?.kind).toBe('text');
    expect(msg?.startPayload).toBeUndefined();
  });

  it('非 private (group/supergroup) → 空数组静默丢', () => {
    const group = JSON.parse(updateJson());
    group.message.chat.type = 'group';
    expect(parseTelegramWebhook(req, JSON.stringify(group))).toEqual([]);
  });

  it('无 message (edited_message / channel_post) → 空', () => {
    expect(parseTelegramWebhook(req, JSON.stringify({ update_id: 9, edited_message: { message_id: 1 } }))).toEqual([]);
  });

  it('无 text (贴纸/图片) → 空 (MVP 仅文本)', () => {
    const noText = JSON.parse(updateJson());
    delete noText.message.text;
    expect(parseTelegramWebhook(req, JSON.stringify(noText))).toEqual([]);
  });

  it('空白 text → 空', () => {
    const blank = JSON.parse(updateJson());
    blank.message.text = '   ';
    expect(parseTelegramWebhook(req, JSON.stringify(blank))).toEqual([]);
  });

  it('非法 JSON / 缺必填字段 → 空 (不抛)', () => {
    expect(parseTelegramWebhook(req, 'not-json{')).toEqual([]);
    expect(parseTelegramWebhook(req, '{"update_id":"x"}')).toEqual([]);
    expect(parseTelegramWebhook(req, '{}')).toEqual([]);
  });

  it('id 为字符串形态也接受 (TG 部分报文 id 序列化差异)', () => {
    const strIds = JSON.parse(updateJson());
    strIds.update_id = '8001';
    strIds.message.from.id = '9001';
    strIds.message.chat.id = '9001';
    const [msg] = parseTelegramWebhook(req, JSON.stringify(strIds));
    expect(msg?.dedupId).toBe('8001');
    expect(msg?.platformUserId).toBe('9001');
    expect(msg?.chatRef).toBe('9001');
  });
});
