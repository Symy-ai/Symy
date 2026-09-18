/**
 * Inventory API — 复用优先物品清单 (batch81-c, BP p12/15/18)
 *
 * GET    /api/inventory        — 列表 (created_at desc)
 * POST   /api/inventory        — 落一条 { item_name, category?, source? }
 * DELETE /api/inventory?id=    — 删自己的一条 (id + user_id 双过滤, 0 行 → 404)
 *
 * user_id 恒取 auth, 永不信 body; RLS (migration 142) 兜底 self-only。
 * 表未建 (42P01, migration 未执行期): GET 回 200 { items: [], inventoryEnabled: false }
 * 优雅降级; 写操作回 503 TABLE_NOT_FOUND (未持久化的写不伪造成功)。
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { inventoryItemSchema, isInventoryTableMissing, type InventoryItemRow } from '@/lib/inventory';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tableMissingResponse() {
  return NextResponse.json(
    { error: 'Inventory table is not set up. Run migration 142_user_inventory.sql in Supabase.', error_code: 'TABLE_NOT_FOUND' },
    { status: 503 },
  );
}

export const GET = withAuth(async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('id, item_name, category, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (isInventoryTableMissing(error)) {
      return NextResponse.json({ items: [], inventoryEnabled: false });
    }
    logger.warn('[inventory] GET failed:', error.message);
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 });
  }

  return NextResponse.json({ items: (data || []) as InventoryItemRow[], inventoryEnabled: true });
});

export const POST = withAuth(async ({ supabase, user, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // safe to ignore: invalid JSON from client → 400
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = inventoryItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_inventory')
    .insert({ user_id: user.id, ...parsed.data })
    .select('id, item_name, category, source, created_at')
    .single();

  if (error) {
    if (isInventoryTableMissing(error)) return tableMissingResponse();
    logger.warn('[inventory] POST failed:', error.message);
    return NextResponse.json({ error: 'Failed to save item' }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
});

export const DELETE = withAuth(async ({ supabase, user, request }) => {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // user_id 双过滤: RLS 之外的纵深防御 — 别人的行在本查询里就是 0 行
  const { count, error } = await supabase
    .from('user_inventory')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    if (isInventoryTableMissing(error)) return tableMissingResponse();
    logger.warn('[inventory] DELETE failed:', error.message);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }

  if (!count) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
