import { beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：全部外部依赖 ———
const getUserCultivationStageMock = vi.fn();
vi.mock('@/lib/cultivation', () => ({
  getUserCultivationStage: (...a: unknown[]) => getUserCultivationStageMock(...(a as [])),
  triggerReassessIfNeeded: vi.fn(() => Promise.resolve()),
}));
const getUserHourlyRateMock = vi.fn();
vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: (...a: unknown[]) => getUserHourlyRateMock(...(a as [])),
}));
vi.mock('@/lib/rag', () => ({
  retrieveUserContext: vi.fn(() => Promise.resolve({ skipped: true, contexts: [], skipReason: 'no-user' })),
  formatContextForPrompt: vi.fn(() => ''),
}));
vi.mock('@/lib/embed-backfill', () => ({
  triggerLazyBackfillIfNeeded: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/shopping-facts-pipeline', () => ({
  loadFactsForContext: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../green-alt-detect', () => ({
  detectGreenAltCard: vi.fn(() => null),
}));
vi.mock('../reuse-detect', () => ({
  detectReuseHint: vi.fn(() => null),
}));
vi.mock('../micro-challenge-detector', () => ({
  detectMicroChallenge: vi.fn(() => null),
}));
vi.mock('@/lib/decision-gate', () => ({
  getProductionGate: vi.fn(() => null),
  findPrecheckSpec: vi.fn(() => null),
  runUnifiedPrecheck: vi.fn(),
  PRECHECK_DEFAULT_TIMEOUT_MS: 1000,
}));
vi.mock('../green-knowledge-context', () => ({
  buildGreenKnowledge: vi.fn(() => ({ contextBlock: null, chipPayload: null })),
}));
vi.mock('../impulse-profile-context', () => ({
  loadImpulseProfileContextLine: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../impulse-forecast-context', () => ({
  loadImpulseForecastContextLine: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../green-commitment-context', () => ({
  loadGreenCommitmentContextLine: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../recent-wins-context', () => ({
  loadRecentWinsContextLine: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../alt-adoption-context', () => ({
  loadAltAdoptionContext: vi.fn(() => Promise.resolve({ line: undefined, card: null })),
}));
vi.mock('../guard-style-context', () => ({
  loadGuardStyleContext: vi.fn(() => Promise.resolve({ line: undefined })),
}));
vi.mock('../spending-cap-context', () => ({
  loadSpendingCapContext: vi.fn(() => Promise.resolve({ exceeded: false, line: '' })),
}));
vi.mock('../green-alt-preference-context', () => ({
  loadGreenAltPreferenceContext: vi.fn(() => Promise.resolve({ state: null, line: undefined })),
}));
vi.mock('../green-alt-retro-context', () => ({
  loadGreenAltRetroContext: vi.fn(() => Promise.resolve({ line: undefined, events: [] })),
  mergeGreenAltRetroPreference: vi.fn((state: unknown) => state),
}));
vi.mock('../prompt-sanitizer', async (importOriginal) => {
  const real = await importOriginal<typeof import('../prompt-sanitizer')>();
  return real; // 纯函数直通 — sanitize 红线用真实现
});
vi.mock('../context-builder', () => ({
  getSymyCartTotalCents: vi.fn(() => Promise.resolve(null)),
  getSymyGreenContext: vi.fn(() => Promise.resolve({ greenPref: 'on' })),
  sanitizeShoppingFactsForPrompt: vi.fn((s: string) => s),
}));
vi.mock('@/lib/bnpl-detector', () => ({
  detectBNPL: vi.fn(() => ({ detected: false, kind: null, amount: null })),
  buildBNPLContextPrefix: vi.fn(() => ''),
}));
// 动态 import 的模块也要 mock (vi.mock 对动态 import 同样生效)
vi.mock('../chat-profile-snapshot', () => ({
  getChatProfileSnapshot: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../user-history-context', () => ({
  getUserHistoryContext: vi.fn(() => Promise.resolve('')),
}));

import { loadLettaTurnContext } from '../letta-turn-context';

function input(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u-1',
    supabase: null,
    userContent: '我想买台咖啡机',
    locale: 'zh' as const,
    greenPref: 'on' as const,
    guardIntensity: undefined,
    guardScope: undefined,
    impulseContext: undefined,
    validChallengeContext: undefined,
    factsStore: undefined,
    microChallengeHistory: undefined,
    suppressGuardCards: false,
    greenAltRetroAnswerContext: undefined,
    ...overrides,
  };
}

describe('loadLettaTurnContext (482行 chat 核心装配)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserCultivationStageMock.mockResolvedValue('zhi_yu');
    getUserHourlyRateMock.mockResolvedValue(20);
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false })) as never;
  });

  it('无 userId: 全降级 — cultivation=zhi_yu, rate=20, prompt 仍完整组装', async () => {
    const r = await loadLettaTurnContext(input({ userId: undefined }));
    expect(r.lettaCultivationStage).toBe('zhi_yu');
    expect(r.userContentWithStage).toContain('<message>我想买台咖啡机</message>');
    expect(r.userContentWithStage).toContain('[Context: cultivation_stage: zhi_yu');
  });

  it('中文锁: [LANGUAGE LOCK] zh 强语言锁 + INSTRUCTION 双保险', async () => {
    const r = await loadLettaTurnContext(input({ locale: 'zh' }));
    expect(r.userContentWithStage).toContain('[LANGUAGE LOCK: The user\'s locale is zh. You MUST reply in Chinese only.');
    expect(r.userContentWithStage).toContain('[INSTRUCTION: The user\'s preferred language is Chinese (Simplified).');
    expect(r.userContentWithStage).toContain('symy_currency: CNY');
    expect(r.userContentWithStage).toContain('symy_lang: zh');
  });

  it('英文锁: en 语言锁 + USD 货币', async () => {
    const r = await loadLettaTurnContext(input({ locale: 'en', userContent: 'I want a coffee machine' }));
    expect(r.userContentWithStage).toContain('[LANGUAGE LOCK: The user\'s locale is en. You MUST reply in English only.');
    expect(r.userContentWithStage).toContain('symy_currency: USD');
    expect(r.userContentWithStage).toContain('<message>I want a coffee machine</message>');
  });

  it('user_id 永不注入 prompt (R22-M3 PII 红线)', async () => {
    const r = await loadLettaTurnContext(input({ userId: 'uuid-should-not-leak' }));
    // R22-M3 修的是旧 'user_id: ' 字段注入; symy_user_ref 是审计过的显式标记
    expect(r.userContentWithStage).not.toContain('user_id: uuid-should-not-leak');
    expect(r.userContentWithStage).toContain('symy_user_ref: uuid-should-not-leak');
  });

  it('挑战上下文: itemName/amount/tier/challenge_id 注入 CURRENT TURN EVENTS (sanitize 真实现)', async () => {
    const r = await loadLettaTurnContext(input({
      validChallengeContext: { itemName: 'Coffee\nMachine', amount: 159, challengeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    }));
    expect(r.userContentWithStage).toContain('challenge: Coffee');
    // sanitize: 换行被清
    expect(r.userContentWithStage).not.toContain('Coffee\nMachine');
    expect(r.userContentWithStage).toContain('$159');
    expect(r.userContentWithStage).toContain('challenge_id: a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('impulse 信号: DETECTED 语义 + NaN 金额落 unknown (BUG-AUDIT-69-7)', async () => {
    const r = await loadLettaTurnContext(input({
      impulseContext: { platform: 'taobao', amount: Number.NaN, reasons: ['深夜', '降价'] },
    }));
    expect(r.userContentWithStage).toContain('impulse_signal: taobao $unknown');
    expect(r.userContentWithStage).toContain('NOT a confirmed purchase');
    expect(r.userContentWithStage).toContain('signals:');
  });

  it('时薪注入: Freedom Translation 指令行 (P0 fix)', async () => {
    getUserHourlyRateMock.mockResolvedValue(50);
    const r = await loadLettaTurnContext(input({ userId: 'u-1' }));
    expect(r.userContentWithStage).toContain('hourly_rate: $50/hr');
    expect(r.userContentWithStage).toContain('Do NOT use $20/hr');
  });

  it('TONE 人设: 小象 persona + 禁止 shame/说教/拦截套话 (2026-09-05 转型)', async () => {
    const r = await loadLettaTurnContext(input({}));
    expect(r.userContentWithStage).toContain('warm little elephant companion');
    expect(r.userContentWithStage).toContain('Never shame the user');
    expect(r.userContentWithStage).toContain('The manipulator is the merchant, not the user');
  });

  it('EVENT REFERENCE RULE: 禁止引用历史轮事件 (P1-A09)', async () => {
    const r = await loadLettaTurnContext(input({}));
    expect(r.userContentWithStage).toContain('[EVENT REFERENCE RULE:');
    expect(r.userContentWithStage).toContain("Do NOT reference specific dollar amounts or purchase items from previous conversation turns");
  });

  it('TOOL LOCALE: MCP 调用带 locale 参数 (N73)', async () => {
    const r = await loadLettaTurnContext(input({ locale: 'zh' }));
    expect(r.userContentWithStage).toContain('[TOOL LOCALE: When calling any MCP tool, include "locale": "zh"');
  });

  it('Buddy 统计: supabase 有数据时注入 EXACT numbers 指令 (P2-2 mood 语义)', async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { vitality: 82, tokens: 120, level: 5, streak: 7, total_saved: 860, challenges_completed: 12, health: 'happy' } }),
    });
    // active_challenges count 查询 — 同一 from 链返回 {count}
    const supabase = { from } as never;
    const r = await loadLettaTurnContext(input({ supabase }));
    expect(r.userContentWithStage).toContain('user_stats: mood 82/100 (happy), level 5, 7-day streak, total saved $860');
  });

  it('greenPref=off: symy_green_pref: off 注入 (客户端开关透传)', async () => {
    const { getSymyGreenContext } = await import('../context-builder');
    vi.mocked(getSymyGreenContext).mockResolvedValueOnce({ greenPref: 'off' } as never);
    const r = await loadLettaTurnContext(input({}));
    expect(r.userContentWithStage).toContain('symy_green_pref: off');
  });

  it('spendingCap.exceeded: 三卡全静默 (greenAlt/reuse/microChallenge)', async () => {
    const { loadSpendingCapContext } = await import('../spending-cap-context');
    vi.mocked(loadSpendingCapContext).mockResolvedValueOnce({ exceeded: true, line: ' | spending_cap: exceeded' } as never);
    const r = await loadLettaTurnContext(input({}));
    expect(r.greenAltCard).toBeNull();
    expect(r.reuseHint).toBeNull();
    expect(r.microChallenge).toBeNull();
    expect(r.userContentWithStage).toContain('spending_cap: exceeded');
  });

  it('返回值形状: 八字段返回 (stage/history/cards/knowledge/footprint)', async () => {
    const r = await loadLettaTurnContext(input({}));
    expect(r).toHaveProperty('userContentWithStage');
    expect(r).toHaveProperty('lettaCultivationStage');
    expect(r).toHaveProperty('lettaUserHistory');
    expect(r).toHaveProperty('greenAltCard');
    expect(r).toHaveProperty('reuseHint');
    expect(r).toHaveProperty('microChallenge');
    expect(r).toHaveProperty('greenKnowledge');
    expect(r).toHaveProperty('altFootprintCard');
  });
});
