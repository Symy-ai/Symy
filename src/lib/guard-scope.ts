/**
 * guard-scope — 守护范围三态 (batch53-b) 的纯函数 SSOT
 *
 * 每个守护品类可独立三态:
 * - guard   守护 (默认): 行为与现状逐字节一致 (prompt 不注入指令行, 卡片不改动)
 * - exempt  豁免: 该品类不再触发拦截卡 (检测仍记录, 只是不打扰), prompt 注入
 *           scope 指令行让小象不再对该品类发起追问
 * - strict  加严: 该品类拦截卡追加"再想想"一拍 (复用 guard-intensity strict 档
 *           的拦截卡尾句机制, 仅对该品类生效)
 *
 * 品类集 = resolveGuardCategory 的已知品类 (guard-category-insight 的
 * KNOWN_CATEGORY_IDS, 不含 other — other 是兜底桶, 无守护语义)。
 *
 * 持久化: localStorage ('symy-guard-scope', 见 hooks/use-guard-scope.ts),
 * 与守护强度同一零 DDL 通路 — 服务端经 chat 请求 body.guardScope 感知。
 *
 * 本文件零依赖, 服务端 prompt 组装 / 卡片预检与前端设置页共用。
 */

/** 可配置守护范围的品类 — 与 guard-category-insight 的 KNOWN_CATEGORY_IDS 同源 */
export const GUARD_SCOPE_CATEGORIES = ['electronics', 'clothing', 'beauty', 'home', 'food'] as const;

export type GuardScopeCategory = (typeof GUARD_SCOPE_CATEGORIES)[number];

export type GuardScopeMode = 'guard' | 'exempt' | 'strict';

/** 全默认 (所有品类 guard) — 与改动前现状逐字节一致, 回归锚点 */
export type GuardScope = Readonly<Record<GuardScopeCategory, GuardScopeMode>>;

export const DEFAULT_GUARD_SCOPE_MODE: GuardScopeMode = 'guard';

export function defaultGuardScope(): GuardScope {
  const scope = {} as Record<GuardScopeCategory, GuardScopeMode>;
  for (const category of GUARD_SCOPE_CATEGORIES) scope[category] = DEFAULT_GUARD_SCOPE_MODE;
  return scope;
}

const GUARD_SCOPE_MODES: readonly GuardScopeMode[] = ['guard', 'exempt', 'strict'];

export function isGuardScopeMode(value: unknown): value is GuardScopeMode {
  return typeof value === 'string' && (GUARD_SCOPE_MODES as readonly string[]).includes(value);
}

export function isGuardScopeCategory(value: unknown): value is GuardScopeCategory {
  return typeof value === 'string' && (GUARD_SCOPE_CATEGORIES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 缺失/损坏输入 → 全默认 guard。
 * 接受: GuardScope 对象 / JSON 字符串 (localStorage 里的原始值) / 任意垃圾。
 * 未知品类键与非法模式值逐键降级为 guard, 不整体丢弃合法键。
 */
export function normalizeGuardScope(value: unknown): GuardScope {
  const parsed = typeof value === 'string' ? tryParseJson(value) : value;
  const scope = defaultGuardScope() as Record<GuardScopeCategory, GuardScopeMode>;
  if (!isPlainObject(parsed)) return scope;
  for (const category of GUARD_SCOPE_CATEGORIES) {
    const mode = parsed[category];
    if (isGuardScopeMode(mode)) scope[category] = mode;
  }
  return scope;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // safe to ignore: 损坏 JSON → 返回 null, 调用方 normalizeGuardScope 整体降级全默认
    return null;
  }
}

export function isGuardScopeDefault(scope: GuardScope): boolean {
  return GUARD_SCOPE_CATEGORIES.every((c) => scope[c] === DEFAULT_GUARD_SCOPE_MODE);
}

/** 豁免品类: 不再触发拦截卡, 小象不再追问 (检测仍记录) */
export function isCategoryExempt(scope: GuardScope, category: GuardScopeCategory): boolean {
  return scope[category] === 'exempt';
}

/** 加严品类: 拦截卡追加"再想想"一拍 (strict 尾句机制, 仅该品类) */
export function isCategoryStrict(scope: GuardScope, category: GuardScopeCategory): boolean {
  return scope[category] === 'strict';
}

/**
 * Letta turn-context 的范围指令行。
 * 全默认返回空串 (prompt 组装处 filter(Boolean) 掉) — 保证默认范围行为与
 * 现状逐字节一致 (AC1 回归锚点)。有豁免/加严各注入一行。
 */
export function buildGuardScopePromptLine(scope: GuardScope): string {
  if (isGuardScopeDefault(scope)) return '';
  const lines: string[] = [];
  const exempted = GUARD_SCOPE_CATEGORIES.filter((c) => isCategoryExempt(scope, c));
  const stricted = GUARD_SCOPE_CATEGORIES.filter((c) => isCategoryStrict(scope, c));
  if (exempted.length > 0) {
    lines.push(
      `[GUARD SCOPE: exempt — the user marked these categories as personal necessities: ${exempted.join(', ')}. For these categories do NOT question the purchase, do NOT offer alternatives, and do NOT follow up — simply acknowledge warmly. Events are still recorded silently, so just stay quiet about them.]`,
    );
  }
  if (stricted.length > 0) {
    lines.push(
      `[GUARD SCOPE: strict — the user chose stricter guarding for: ${stricted.join(', ')}. For these categories, after the alternative suggestion add one gentle "think once more" beat before the purchase. Still zero shame framing.]`,
    );
  }
  return lines.join('\n\n');
}

/** "专属守护地图"小结口径: 各态品类计数 (其他 = guard) */
export interface GuardScopeSummary {
  guarded: number;
  exempt: number;
  strict: number;
  total: number;
}

export function guardScopeSummary(scope: GuardScope): GuardScopeSummary {
  let exempt = 0;
  let strict = 0;
  for (const category of GUARD_SCOPE_CATEGORIES) {
    if (isCategoryExempt(scope, category)) exempt += 1;
    else if (isCategoryStrict(scope, category)) strict += 1;
  }
  const total = GUARD_SCOPE_CATEGORIES.length;
  return { guarded: total - exempt - strict, exempt, strict, total };
}
