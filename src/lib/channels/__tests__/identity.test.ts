/**
 * identity.test — 影子账号身份解析（设计 §4 方案 B）
 *
 * 设计原定对 QA Supabase 做集成测试；本机无 QA 库访问（service key 不在本地 env），
 * 降级为 mock createAdminClient 的单元测试（覆盖：首次建号 / 重复 resolve 幂等 /
 * binding insert 并发竞态读回胜者行 / createUser 失败 / admin client 缺失）。
 * 真实库验证留给 QA 阶段（设计 §12 阶段 MVP 步骤 4）。
 *
 * 链形状按 identity.ts 源码调用序搭（坑 118）：
 * - 初查/竞态复读: from('channel_bindings').select().eq().eq().maybeSingle()
 * - 建 binding:    from('channel_bindings').insert().select().single()
 * - hit 刷新:      from('channel_bindings').update().eq().eq()  (await thenable)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const deleteUser = vi.fn(); // M4 补偿删除 — createUser 成功 + insert 非 23505 失败路径专用
const getOrCreateAgentId = vi.fn();
const selectMaybeSingle = vi.fn(); // 初查与竞态复读共用形态, 按序 mockResolvedValueOnce
const insertSingle = vi.fn();
const updateSecondEq = vi.fn();
const getPostHogServer = vi.fn();

/** 测试注入的 admin client (let 惰性赋值, 工厂闭包延迟求值 — 坑 49 技法) */
let adminSupabase: unknown = null;

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: adminSupabase, error: adminSupabase ? null : 'Missing env' }),
}));

vi.mock('@/lib/letta-agent-manager', () => ({
  getOrCreateAgentId: (userId: string) => getOrCreateAgentId(userId),
}));

vi.mock('@/lib/logger', () => ({
  logger,
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogServer: () => getPostHogServer(),
}));

import { localeFromLanguageHint, resolveOrCreateBinding, shadowAccountEmail } from '../identity';
import type { InboundMessage } from '../types';

function fakeSupabase(): unknown {
  return {
    auth: {
      admin: {
        createUser: (attrs: Record<string, unknown>) => createUser(attrs),
        deleteUser: (uid: string) => deleteUser(uid),
      },
    },
    from: (table: string) => {
      // 坑 16: 表名断言内联 — mock 悄悄错配即炸
      expect(table).toBe('channel_bindings');
      return {
        select: (cols: string) => {
          expect(cols).toContain('user_id');
          return {
            eq: () => ({
              eq: () => ({ maybeSingle: () => selectMaybeSingle() }),
            }),
          };
        },
        insert: () => ({ select: () => ({ single: () => insertSingle() }) }),
        update: () => ({
          eq: () => ({
            // 真链第二 eq 返回 PostgrestFilterBuilder (thenable) — mock 用 Promise 等价
            eq: () => updateSecondEq(),
          }),
        }),
      };
    },
  };
}

function makeMsg(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    platform: 'telegram',
    platformUserId: '9001',
    chatRef: '9001',
    text: 'ping',
    dedupId: '8001',
    languageHint: 'zh-CN',
    kind: 'text',
    ...overrides,
  };
}

describe('resolveOrCreateBinding — 首次建号（影子账号）', () => {
  beforeEach(() => {
    createUser.mockReset();
    deleteUser.mockReset().mockResolvedValue({ data: {}, error: null });
    getOrCreateAgentId.mockReset();
    selectMaybeSingle.mockReset();
    insertSingle.mockReset();
    updateSecondEq.mockReset();
    updateSecondEq.mockReturnValue(Promise.resolve({ data: null, error: null }));
    adminSupabase = fakeSupabase();
    getPostHogServer.mockReset().mockReturnValue({
      capture: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('miss → createUser(确定性邮箱, email_confirm) → insert binding → 预建 agent', async () => {
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-new' } }, error: null });
    insertSingle.mockResolvedValueOnce({
      data: { user_id: 'u-new', locale: 'zh', chat_ref: '9001' },
      error: null,
    });
    getOrCreateAgentId.mockResolvedValueOnce('agent-1');

    const result = await resolveOrCreateBinding(makeMsg());

    expect(result).toEqual({ userId: 'u-new', locale: 'zh', chatRef: '9001', created: true });
    // 确定性邮箱 = 幂等键（§4.2）+ 免邮件回路
    expect(createUser).toHaveBeenCalledWith({
      email: 'tg-9001@channels.symy.internal',
      email_confirm: true,
      user_metadata: { channel: 'telegram', platform_user_id: '9001' },
    });
    expect(getOrCreateAgentId).toHaveBeenCalledWith('u-new');
  });

  it('绑定创建成功 → 发送 channel_bind_created 遥测', async () => {
    const capture = vi.fn();
    getPostHogServer.mockReturnValue({ capture, flush: vi.fn().mockResolvedValue(undefined) });
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-new' } }, error: null });
    insertSingle.mockResolvedValueOnce({
      data: { user_id: 'u-new', locale: 'zh', chat_ref: '9001' },
      error: null,
    });
    await resolveOrCreateBinding(makeMsg());
    expect(capture).toHaveBeenCalledWith({
      distinctId: 'u-new',
      event: 'channel_bind_created',
      properties: { platform: 'telegram' },
    });
  });

  it('agent 预建失败不 fatal — 绑定仍成功返回（回合侧 agent_unavailable 兜底）', async () => {
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-new' } }, error: null });
    insertSingle.mockResolvedValueOnce({
      data: { user_id: 'u-new', locale: 'zh', chat_ref: '9001' },
      error: null,
    });
    getOrCreateAgentId.mockResolvedValueOnce(null);

    const result = await resolveOrCreateBinding(makeMsg());

    expect(result).toEqual({ userId: 'u-new', locale: 'zh', chatRef: '9001', created: true });
  });

  it('createUser 失败（如 422 email exists 竞态残留）→ null, 不写 binding', async () => {
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: null, error: { status: 422, message: 'already registered' } });

    expect(await resolveOrCreateBinding(makeMsg())).toBeNull();
    expect(insertSingle).not.toHaveBeenCalled();
    expect(getOrCreateAgentId).not.toHaveBeenCalled();
  });

  it('admin client 缺失（env 未配）→ null', async () => {
    adminSupabase = null;
    expect(await resolveOrCreateBinding(makeMsg())).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe('resolveOrCreateBinding — 重复 resolve 幂等', () => {
  beforeEach(() => {
    createUser.mockReset();
    deleteUser.mockReset().mockResolvedValue({ data: {}, error: null });
    getOrCreateAgentId.mockReset();
    selectMaybeSingle.mockReset();
    insertSingle.mockReset();
    updateSecondEq.mockReset();
    updateSecondEq.mockReturnValue(Promise.resolve({ data: null, error: null }));
    adminSupabase = fakeSupabase();
  });

  it('hit → 同 user_id 复用, 不建号不插行; best-effort 刷新 last_seen', async () => {
    selectMaybeSingle.mockResolvedValueOnce({
      data: { user_id: 'u-bound', locale: 'en', chat_ref: '9001' },
      error: null,
    });

    const result = await resolveOrCreateBinding(makeMsg());

    expect(result).toEqual({ userId: 'u-bound', locale: 'en', chatRef: '9001', created: false });
    expect(createUser).not.toHaveBeenCalled();
    expect(insertSingle).not.toHaveBeenCalled();
    expect(getOrCreateAgentId).not.toHaveBeenCalled();
    // hit 路径活跃刷新链被走到尾部
    expect(updateSecondEq).toHaveBeenCalled();
  });

  it('binding insert 撞 23505（并发他方先写）→ 读回胜者行, 绝不覆写他人 user_id', async () => {
    // 初查 miss → 建号 → insert 冲突 → 复读胜者行
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { user_id: 'u-winner', locale: 'zh', chat_ref: '9001' }, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-loser' } }, error: null });
    insertSingle.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });
    getOrCreateAgentId.mockResolvedValueOnce('agent-winner');

    const result = await resolveOrCreateBinding(makeMsg());

    expect(result).toEqual({ userId: 'u-winner', locale: 'zh', chatRef: '9001', created: false });
    // 竞态分支也对胜者幂等预建 agent (getOrCreate 语义安全)
    expect(getOrCreateAgentId).toHaveBeenCalledWith('u-winner');
    // 23505 分支不触发补偿删除 — 胜者 binding 行存在, 删除语义不适用 (M4 边界锚)
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('23505 后胜者行也读不到（极端）→ null', async () => {
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-x' } }, error: null });
    insertSingle.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await resolveOrCreateBinding(makeMsg())).toBeNull();
  });

  it('binding insert 其他错误（如 FK/权限）→ null + 补偿删除孤儿 auth 用户 (M4)', async () => {
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-new' } }, error: null });
    insertSingle.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'RLS violation' } });

    expect(await resolveOrCreateBinding(makeMsg())).toBeNull();
    // 孤儿补偿删除 — 不删则确定性邮箱残留, 下次 createUser 恒 422 → 永久静默锁死
    expect(deleteUser).toHaveBeenCalledWith('u-new');
  });

  it('补偿删除失败也不炸 (fire-and-forget, 仅遗留孤儿无安全面)', async () => {
    selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    createUser.mockResolvedValueOnce({ data: { user: { id: 'u-new' } }, error: null });
    insertSingle.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'RLS violation' } });
    deleteUser.mockRejectedValueOnce(new Error('admin api down'));

    expect(await resolveOrCreateBinding(makeMsg())).toBeNull();
    expect(deleteUser).toHaveBeenCalledWith('u-new');
    await vi.waitFor(() => {
      expect(logger.debug).toHaveBeenCalledWith(
        '[Channel] shadow_user_compensation_delete_failed user=%s',
        'u-new'.substring(0, 8),
        expect.any(Error),
      );
    });
  });
});

describe('localeFromLanguageHint (§4.3: zh* → zh, 其余 en, 无提示默认 zh)', () => {
  it.each([
    [undefined, 'zh'],
    ['zh-CN', 'zh'],
    ['zh', 'zh'],
    ['en', 'en'],
    ['fr', 'en'],
  ])('%s → %s', (hint, expected) => {
    expect(localeFromLanguageHint(hint)).toBe(expected);
  });
});

describe('shadowAccountEmail — 平台前缀 + 非法字符 sanitize', () => {
  it('telegram → tg-<id>@channels.symy.internal', () => {
    expect(shadowAccountEmail('telegram', '9001')).toBe('tg-9001@channels.symy.internal');
  });

  it('wechat_mp → wxmp- 前缀', () => {
    expect(shadowAccountEmail('wechat_mp', 'oX7_ab')).toBe('wxmp-oX7_ab@channels.symy.internal');
  });

  it('platformUserId 含邮箱非法字符时替换为 _', () => {
    expect(shadowAccountEmail('telegram', 'a@b.c')).toBe('tg-a_b_c@channels.symy.internal');
  });
});
