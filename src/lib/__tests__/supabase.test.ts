import { describe, expect, it } from 'vitest';

import type { EmailConnection, EmailReceipt } from '../supabase';

/**
 * supabase.ts (47行) — 邮件连接/收据类型 (纯类型, 方法论第八用)。
 *
 * 锁定:
 * - EmailConnection: provider 三态 (gmail/outlook/imap_* 模板)/status 四态
 * - EmailReceipt: status 五态流水 (detected→actionable→refunding→refunded/ignored)
 *   + refund 双件 (eligible/deadline)
 * - satisfies 形状锚
 */
describe('supabase 邮件类型 (纯类型件第八用)', () => {
  it('EmailConnection satisfies: provider 三态+status 四态', () => {
    const conn = {
      id: 'c1',
      user_id: 'u1',
      email_address: 'a@b.c',
      provider: 'gmail',
      access_token: 'tk',
      token_expiry: '2026-12-01',
      scopes: ['read'],
      status: 'active',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    } satisfies EmailConnection;
    expect(conn.provider).toBe('gmail');

    const providers: EmailConnection['provider'][] = ['gmail', 'outlook', 'imap_qq.com'];
    expect(providers).toHaveLength(3);
    const statuses: EmailConnection['status'][] = ['active', 'expired', 'revoked', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('EmailReceipt satisfies: 五态流水+refund 双件', () => {
    const receipt = {
      id: 'r1',
      user_id: 'u1',
      connection_id: 'c1',
      message_id: 'm1',
      from_address: 'mall@x.com',
      subject: '订单已发货',
      snippet: '...',
      platform: 'taobao',
      currency: 'CNY',
      received_at: '2026-10-01T10:00:00Z',
      impulse_score: 72,
      refund_eligible: true,
      refund_deadline: '2026-10-08',
      status: 'actionable',
      created_at: '2026-10-01',
    } satisfies EmailReceipt;
    expect(receipt.refund_eligible).toBe(true);

    // 五态流水锚
    const statuses: EmailReceipt['status'][] = ['detected', 'actionable', 'refunding', 'refunded', 'ignored'];
    expect(statuses).toHaveLength(5);
  });
});
