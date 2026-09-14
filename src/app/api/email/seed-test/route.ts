/**
 * 测试用：插入模拟的 TikTok Shop 邮件收据到数据库
 * POST /api/email/seed-test
 * Body: { platform?: string, amount?: number }
 *
 * 此接口仅用于开发/测试环境，方便验证 receipt UI 显示效果
 * 不需要 Gmail OAuth，直接插入数据库记录
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies calls — now handled automatically by withAuth).
 *    Admin auth check preserved (dual auth: admin + user).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { asInsertArray } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];

// 模拟收据数据
const MOCK_RECEIPTS = [
  {
    platform: 'tiktok_shop',
    from_address: 'TikTok Shop <order@shop.tiktok.com>',
    subject: 'Order Confirmation - Your TikTok Shop Order Has Been Received',
    snippet: 'Thank you for your purchase on TikTok Shop! Order Number: TT-SHOP-20260516-A7K9M2. Item: Wireless Bluetooth Earbuds - Midnight Black. Total: $34.99',
    order_id: 'TT-SHOP-20260516-A7K9M2',
    item_name: 'Wireless Bluetooth Earbuds - Midnight Black',
    amount: 34.99,
    impulse_score: 65,
  },
  {
    platform: 'tiktok_shop',
    from_address: 'TikTok Shop <order@shop.tiktok.com>',
    subject: 'Thank You for Your Purchase on TikTok Shop!',
    snippet: 'Your order has been confirmed! Order Number: TT-SHOP-20260515-B3X8N4. Item: LED Strip Lights RGB 5M. Total: $12.99',
    order_id: 'TT-SHOP-20260515-B3X8N4',
    item_name: 'LED Strip Lights RGB 5M',
    amount: 12.99,
    impulse_score: 55,
  },
  {
    platform: 'amazon',
    from_address: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Your Amazon.com Order Confirmation',
    snippet: 'Thank you for your order! Order #112-3456789-0123456. Item: Portable Phone Charger 20000mAh. Order Total: $29.99',
    order_id: '112-3456789-0123456',
    item_name: 'Portable Phone Charger 20000mAh',
    amount: 29.99,
    impulse_score: 45,
  },
  {
    platform: 'temu',
    from_address: 'Temu <noreply@temu.com>',
    subject: 'Your Temu Order Has Been Placed!',
    snippet: 'Order confirmed! Order #TM-20260514-K2P7. Item: Kitchen Gadget Set 10-Piece. Total: $8.49',
    order_id: 'TM-20260514-K2P7',
    item_name: 'Kitchen Gadget Set 10-Piece',
    amount: 8.49,
    impulse_score: 50,
  },
  {
    platform: 'shein',
    from_address: 'SHEIN <noreply@shein.com>',
    subject: 'Your Order Has Been Placed - SHEIN',
    snippet: 'Order confirmed! Order Number: SH-20260513-M9Q3. Item: Casual Summer Dress - Beige. Total: $15.99',
    order_id: 'SH-20260513-M9Q3',
    item_name: 'Casual Summer Dress - Beige',
    amount: 15.99,
    impulse_score: 40,
  },
];

export const POST = withAuth(async ({ supabase, user, request }) => {
  // Require admin auth for seed endpoint (security: prevent arbitrary data insertion)
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Admin auth required for seed endpoint' }, { status: 401 });
  }

  // Also disabled in Vercel production
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') {
    return NextResponse.json({ error: 'This endpoint is disabled in production' }, { status: 403 });
  }

  // 先确保用户有 email_connection (测试用，不需要真的连 Gmail)
  const { data: connections } = await supabase
    .from('email_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1);

  let connectionId: string;

  if (connections && connections.length > 0) {
    connectionId = connections[0].id;
  } else {
    const { data: newConn, error: connError } = await supabase
      .from('email_connections')
      .insert({
        user_id: user.id,
        email_address: 'test-gmail@gmail.com',
        provider: 'gmail',
        access_token: 'test-token-placeholder',
        refresh_token: 'test-refresh-placeholder',
        token_expiry: new Date(Date.now() + 365 * 86400000).toISOString(),
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        status: 'active',
      })
      .select('id')
      .maybeSingle();

    if (connError || !newConn) {
      logger.error('[Seed Test] Failed to create test connection:', connError);
      return NextResponse.json({ error: 'Failed to create test connection' }, { status: 500 });
    }
    connectionId = newConn.id;
  }

  const seedTestSchema = z.object({
    platform: z.string().max(50).optional(),
    amount: z.number().finite().min(0).max(1_000_000).optional(),
  }).passthrough();
  let body;
  try {
    body = seedTestSchema.parse(await request.json());
  } catch {
    body = {};
  }
  const selectedPlatform = body.platform;
  const customAmount = body.amount;

  const receiptsToInsert = selectedPlatform
    ? MOCK_RECEIPTS.filter((r) => r.platform === selectedPlatform)
    : MOCK_RECEIPTS;

  const now = new Date();
  const records = receiptsToInsert.map((receipt, index) => {
    const receivedAt = new Date(now.getTime() - (index * 86400000 + Math.random() * 43200000));
    const refundDeadline = new Date(receivedAt.getTime() + 30 * 86400000);

    return {
      user_id: user.id,
      connection_id: connectionId,
      message_id: `test-msg-${Date.now()}-${index}`,
      thread_id: `test-thread-${Date.now()}`,
      from_address: receipt.from_address,
      subject: receipt.subject,
      snippet: receipt.snippet,
      platform: receipt.platform,
      order_id: receipt.order_id,
      item_name: receipt.item_name,
      amount: customAmount || receipt.amount,
      currency: 'USD',
      received_at: receivedAt.toISOString(),
      impulse_score: receipt.impulse_score,
      refund_eligible: true,
      refund_deadline: refundDeadline.toISOString(),
      status: receipt.impulse_score >= 60 ? 'actionable' : 'detected',
    };
  });

  const { data: insertedReceipts, error: insertError } = await supabase
    .from('email_receipts')
    .insert(asInsertArray<EmailReceiptsInsert>(records))
    .select();

  if (insertError) {
    logger.error('[Seed Test] Insert failed:', insertError);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  const insertedReceiptList = (insertedReceipts || []) as Array<{ id: string; message_id: string }>;
  const events = records
    .filter((r) => r.impulse_score >= 40 && r.amount)
    .map((r) => {
      const receipt = insertedReceiptList.find(ir => ir.message_id === r.message_id);
      return {
        user_id: user.id,
        platform: r.platform,
        source: 'patrol' as const,
        title: r.subject,
        amount: r.amount,
        category: r.platform,
        is_livestream: false,
        is_flash_sale: false,
        impulse_score: r.impulse_score,
        reasons: [`Email receipt from ${r.platform}`, (r.amount || 0) > 50 ? 'High amount' : ''],
        raw_text: r.snippet,
        receipt_id: receipt?.id || null,
      };
    });

  if (events.length > 0) {
    await supabase.from('impulse_events').insert(events);
  }

  return NextResponse.json({
    success: true,
    message: `Inserted ${insertedReceipts?.length || 0} test receipts`,
    receipts: insertedReceipts,
    connectionId,
  });
});
