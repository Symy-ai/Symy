/**
 * Tests for POST/GET /api/green-alt/adoption (batch45-a)
 *
 * - POST 400: unknown/missing entryId
 * - POST dedup: same trigger_id already recorded → success + deduplicated, no insert
 * - POST 200: inserts audit row (event_type mindful_recovery, zero vitality/token change, metadata.kind)
 * - GET 200: aggregates total + byCategory from metadata rows
 * - GET: non-adoption mindful_recovery rows (no trigger prefix filter) excluded by kind check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';

type Chain = Record<string, ReturnType<typeof vi.fn>> & { then: unknown };

function makeChain(terminal: () => Promise<unknown> = async () => ({ data: null, error: null })): Chain {
  const chain = {} as Chain;
  const method = () => vi.fn(() => chain);
  chain.from = method();
  chain.select = method();
  chain.eq = method();
  chain.like = method();
  chain.gte = method();
  chain.limit = method();
  chain.maybeSingle = method();
  chain.insert = method();
  // 链式查询被 await 时 (末尾无 maybeSingle 的 GET 路径), 解析为 terminal 结果
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve().then(terminal).then(onFulfilled, onRejected);
  return chain;
}

function authed(chain: Chain) {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: {},
    user: { id: 'user-123' },
    error: null,
    mergeCookies: (r: Response) => r,
    mergeCookiesOnResponse: (r: Response) => r,
  });
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: { from: chain.from },
    error: null,
  });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/green-alt/adoption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/green-alt/adoption', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/green-alt/adoption', () => {
  it('400 on unknown entryId', async () => {
    const chain = makeChain();
    authed(chain);
    const res = await POST(makePostRequest({ entryId: 'not_a_real_entry' }));
    expect(res.status).toBe(400);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('400 on missing entryId', async () => {
    const chain = makeChain();
    authed(chain);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('deduplicates when trigger_id already recorded (no insert)', async () => {
    const chain = makeChain(async () => ({ data: [{ id: 'evt-1' }], error: null }));
    authed(chain);
    const res = await POST(makePostRequest({ entryId: 'fur' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduplicated).toBe(true);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('inserts audit row with zero side effects and metadata marker', async () => {
    // select('id').eq().eq().limit(1) → dedup miss; then vitality read; then insert
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 72 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId: 'fur', estSaved: 42 }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(row.event_type).toBe('mindful_recovery');
    expect(row.vitality_change).toBe(0);
    expect(row.token_change).toBe(0);
    expect(row.trigger_id).toContain('green-alt-adoption:fur');
    expect((row.metadata as Record<string, unknown>).kind).toBe('green_alt_adoption');
    expect((row.metadata as Record<string, unknown>).estSaved).toBe(42);
  });

  // 回归 (batch45 arch review): 美妆词条曾不在 known 集, 采纳必 400 静默丢
  it('200 on beauty entry id (beauty_refill) — known set regression', async () => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId: 'beauty_refill' }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch46, 同 028aaf4 教训): 数码词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'refurb_gadget',
    'secondhand_audio_tablet',
    'trade_in_upgrade',
    'repair_first',
    'cable_hoard',
  ])('200 on electronics entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch47-c, 同 028aaf4 教训): 食品饮品词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'milk_tea',
    'takeout_meal',
    'bottled_water',
    'coffee_shop',
    'snack_hoarding',
  ])('200 on food entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch49-b, 同 028aaf4 教训): 服饰鞋包词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'new_clothes',
    'limited_sneakers',
    'handbag_rotation',
    'wardrobe_audit',
    'capsule_wardrobe',
  ])('200 on apparel entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch49-b, 同 028aaf4 教训): 居家生活词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'storage_gadgets',
    'aroma_diffuser',
    'promo_household_stockup',
    'small_appliance',
    'upcycle_decor',
  ])('200 on household entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch61-c, 同 028aaf4 教训): 健康个护词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'medicine_expiry_audit',
    'contact_lens_supply_pace',
    'beauty_device_idle_check',
    'fragrance_rotation',
    'vitamin_duplicate_check',
  ])('200 on health-care entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch62-a, 同 028aaf4 教训): 维修再利用词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'shoe_repair_first',
    'bag_care_repair',
    'clothes_mend_alter',
    'phone_battery_screen_repair',
    'appliance_checkup_repair',
    'bike_maintenance',
  ])('200 on repair-care entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  // 回归 (batch63-a, 同 028aaf4 教训): 庆典礼赠词条必须全部在 known 集, 漏注册 = 采纳 400 静默丢
  it.each([
    'wedding_decor_rental',
    'wedding_return_gift',
    'birthday_party_experience',
    'festival_decor_reuse',
    'housewarming_open_house',
    'office_gift_exchange',
    'elder_celebration_together',
    'favor_homemade_local',
  ])('200 on celebration entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    'pet_food_starter_small',
    'pet_treat_one_kind',
    'pet_supply_reuse_borrow',
    'pet_cleaning_refill_first',
    'pet_toy_single_start',
    'pet_allergy_small_pack',
  ])('200 on pet-first-care entry id (%s) — known set regression', async (entryId) => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 0 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ entryId }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/green-alt/adoption', () => {
  it('aggregates total + byCategory from adoption rows', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 10 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'ivory_bone_carving', estSaved: 5 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'tissues', estSaved: 3 } },
        { metadata: { kind: 'other_thing', entryId: 'fur' } }, // 非 adoption 标记, 不计
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 2, home: 1, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
    expect(json.savedEstimate).toBe(18);
  });

  it('returns zeros when no rows', async () => {
    const chain = makeChain(async () => ({ data: [], error: null }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.total).toBe(0);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates beauty adoptions into beauty bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'sheet_mask_pile', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 1, home: 0, beauty: 2, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates apparel/household adoptions into their own buckets', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'capsule_wardrobe', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'handbag_rotation', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'small_appliance', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 2, household: 1, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates digital-content adoptions into their own bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'ebook_repurchase', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'cloud_storage_declutter', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'music_repurchase', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 3, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates repair-care adoptions into their own bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'shoe_repair_first', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'clothes_mend_alter', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'bike_maintenance', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 3, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates health-care adoptions into their own bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'medicine_expiry_audit', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'fragrance_rotation', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'vitamin_duplicate_check', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 3, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates celebration adoptions into their own bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'wedding_decor_rental', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'festival_decor_reuse', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'favor_homemade_local', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 3, 'pet-first-care': 0, other: 0 });
  });

  it('aggregates pet-first-care adoptions into their own bucket', async () => {
    const chain = makeChain(async () => ({
      data: [
        { metadata: { kind: 'green_alt_adoption', entryId: 'pet_food_starter_small', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'pet_supply_reuse_borrow', estSaved: 0 } },
        { metadata: { kind: 'green_alt_adoption', entryId: 'pet_allergy_small_pack', estSaved: 0 } },
      ],
      error: null,
    }));
    authed(chain);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.byCategory).toEqual({ wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 3, other: 0 });
  });
});
