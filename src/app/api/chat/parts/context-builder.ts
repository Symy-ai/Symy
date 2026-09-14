/**
 * context-builder — 构建 AI 接收的 user message context prefix
 *
 * 从 chat/route.ts 抽出 (架构分析第二阶段 §5.6)
 *
 * 格式 (A2 缓存分层审计后, 2026-09-07):
 *   [Context: cultivation_stage: zhi_yu | locale: zh | symy_user_ref: UUID | symy_session_ref: UUID
 *             | symy_lang: zh | symy_currency: CNY | symy_green_pref: on]        ← 稳定层 (消息头部)
 *   [INSTRUCTION: ... reply in English only.] (仅 locale !== 'zh' 时)
 *   <user_history>...</user_history> (RAG 检索结果)
 *   [Context: symy_cart_total_cents: 0 | symy_impulse_item: 名称 | challenge: ... | impulse: ...]
 *                                                                              ← 易变层 (消息尾部)
 *   <message>actual user message</message>
 *
 * 设计:
 * - N46 fix: 注入 challengeContext, 让 AI 知道当前在挑战中
 * - 状态外置: 注入 challengeId, AI 调 complete_challenge 只需传 challenge_id + status
 * - 状态外置: 注入 impulseContext, AI 调 record_impulse 能从 context 取 platform/amount
 * - Bug 5 fix: 显式语言指令, 让 Letta agent 遵守 UI 语言偏好
 * - 绿色转向: 注入 symy_green_pref (用户绿色偏好开关, 默认 on) + symy_impulse_item
 *   (最近冲动记录的商品名), 让脑在用户想买高环境影响产品时给替代建议
 *
 * 🔧 A2 移植 (commerce-agents 上下文三层缓存排列, 2026-09-07, Apache-2.0 模式借鉴):
 *   [Context:] 字段按变化频率分两层, 字段集合不变, 只调序 —
 *   1) 稳定层 (消息头): 栽培阶段 / locale / user_ref / session_ref / lang / currency /
 *      green_pref — 会话内字节级不变。跨轮对话中它们固定出现在前缀最前面,
 *      provider 前缀缓存 (KV cache) 命中率高; 时间性字段夹在中间 = 缓存全灭。
 *   2) 易变层 (消息尾, 紧贴 <message> 之前): cart_total_cents / 最近冲动商品名 /
 *      当前挑战状态 / 本轮冲动信号 — 每轮都可能变, 挪到尾部后它们永不插进稳定字节之间,
 *      且处于本轮新消息段内 (本就无缓存可言), 不污染任何可缓存前缀。
 *   模型侧无感知差异: 两个字段集仍以 [Context: ...] 标记出现 (prompt L180 契约不变),
 *   challenge_id / symy_user_ref 等字段名与取值完全不变。
 */

import type { CultivationStage } from "@/lib/cultivation";
import { getChallengeType } from "@/lib/challenge-rules";
import type { ChallengeContext } from "./types";
// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): ImpulseContext 单一 source of truth
import type { ImpulseContext } from "@/types/impulse-context";
import { createClient } from "@supabase/supabase-js";
export type { ImpulseContext };
// 🔧 P0-3 fix (2026-07-18, AUDIT-CHAT-ROUTE): sanitize challenge/impulse
//    context fields before prompt interpolation to prevent prompt injection.
import {
  sanitizeItemName,
  sanitizePlatform,
  sanitizeReasons,
  sanitizeChallengeId,
} from "./prompt-sanitizer";
import { GREEN_ALTERNATIVES, type GreenLocale } from "@/lib/green-alternatives";
import { logger } from "@/lib/logger";

export interface BuildContextParams {
  userId: string | undefined;
  cultivationStage: CultivationStage;
  locale?: string;
  challengeContext?: ChallengeContext;
  impulseContext?: ImpulseContext;
  userHistory?: string;
  userContent: string;
  symyUserRef?: string;
  symySessionRef?: string;
  symyCurrency?: string;
  symyCartTotalCents?: number | null;
  /** 绿色偏好开关 (用户 profile, 缺省 on) */
  symyGreenPref?: "on" | "off";
  /** 最近冲动记录的商品名 (impulse_events.title, 无则省略) */
  symyImpulseItem?: string;
  /** 购物事实单行摘要 (shopping_facts 表, batch25-b; 加载失败/为空省略) */
  symyShoppingFacts?: string;
}

export interface SymyGreenContext {
  greenPref: "on" | "off";
  impulseItem?: string;
}

function formatGreenAlternativeLine(text: string): string {
  const normalized = text.replace(/[\r\n]+/g, " ").trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
}

/**
 * 绿色偏好 on 时注入替代话术库 (symy_green_alternatives)。
 *
 * - 只注入当前 locale 的一条完整建议 (alternative + reuse), 每类一行并截断
 * - 话术库读取/遍历异常时返回 undefined, 聊天 prompt 保持接线前形态
 */
export function buildGreenAlternativesContext(
  greenPref: "on" | "off" | undefined,
  locale: string | undefined,
): string | undefined {
  if (sanitizeGreenPref(greenPref) === "off") return undefined;

  try {
    const selectedLocale: GreenLocale = locale === "zh" ? "zh" : "en";
    const lines = GREEN_ALTERNATIVES.map(
      (entry) =>
        `${entry.id}: ${formatGreenAlternativeLine(
          selectedLocale === "zh"
            ? `${entry.alternative[selectedLocale]}${entry.reuse[selectedLocale]}`
            : `${entry.alternative[selectedLocale]} ${entry.reuse[selectedLocale]}`,
        )}`,
    );
    return lines.length > 0
      ? `[symy_green_alternatives]\n${lines.join("\n")}`
      : undefined;
  } catch (error) {
    logger.warn(
      "[ContextBuilder] Ignoring green alternatives injection failure:",
      error,
    );
    return undefined;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

function sanitizeSymyRef(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value.trim()) ? value.trim() : undefined;
}

function sanitizeIsoCurrency(value: string | undefined): string | undefined {
  return value && ISO_CURRENCY_PATTERN.test(value)
    ? value.toUpperCase()
    : undefined;
}

function sanitizeNonNegativeCents(
  value: number | null | undefined,
): number | undefined {
  return value !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

/**
 * 绿色偏好开关 sanitize — 只有显式 'off' 才关闭, 其余 (undefined/非法值) 一律 'on'。
 * 沿用 prompt-sanitizer 模式: 不让非法值进 prompt。
 */
function sanitizeGreenPref(value: "on" | "off" | undefined): "on" | "off" {
  return value === "off" ? "off" : "on";
}

/**
 * 请求级绿色偏好 sanitize — 客户端把设置页「绿色守护模式」开关 (localStorage 持久化)
 * 放进 chat 请求 body.greenPref 透传上来。只有 'on'/'off' 合法;
 * 脏值 (版本差异/手工构造请求) 不进 prompt, 降级为 undefined → 走 profiles 探测路径 (缺省 on)。
 */
function sanitizeRequestGreenPref(value: unknown): "on" | "off" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "on" || value === "off") return value;
  // safe to ignore: 非法 greenPref 只来自版本差异或手工请求, 降级为默认 on 是安全兜底, 不值得中断聊天
  logger.warn(
    "[ContextBuilder] Ignoring invalid request-level greenPref, falling back to profile probe:",
    typeof value,
  );
  return undefined;
}

/**
 * 购物事实摘要 sanitize (batch25-b) — 纵深防御最后一道: 摘要来自 shopping_facts
 * 表 (落库前已过 buildShoppingFact 卫生化, 摘要拼接时再剥一道), 但 prompt 稳定层
 * 是注入高价值面, 这里再剥一遍方括号/尖括号 (防逃出 [Context: ...] 标记 / 伪造
 * <message> 边界) + 控制字符清除 + 折行压平, 超长截到 240。剥完为空 → undefined
 * (字段整体省略, 与既有 filter 约定一致)。chat/route.ts 的内联 symyFields 活路径
 * 复用同一函数, 单一实现。
 */
const FACTS_STRIP_PATTERN = /[\[\]{}()<>]/g;
const FACTS_SUMMARY_MAX_CHARS = 240;

export function sanitizeShoppingFactsForPrompt(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const line = value
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(FACTS_STRIP_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FACTS_SUMMARY_MAX_CHARS);
  return line.length > 0 ? line : undefined;
}

export async function getSymyCartTotalCents(
  symyUserRef?: string,
): Promise<number | null | undefined> {
  const url = process.env.SYMY_SUPABASE_URL;
  const key = process.env.SYMY_SUPABASE_KEY;
  const userRef = sanitizeSymyRef(symyUserRef);
  if (!url || !key || !userRef) return undefined;

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("cart_lines")
      .select("price_cents,qty")
      .eq("user_ref", userRef);
    if (error || !data || data.length === 0) return null;
    const total = data.reduce(
      (sum, line) => sum + Number(line.price_cents) * Number(line.qty),
      0,
    );
    return sanitizeNonNegativeCents(total);
  } catch {
    // safe to ignore: cart total is best-effort and may be omitted
    return null;
  }
}

/**
 * 读取绿色上下文 (symy_green_pref + symy_impulse_item 的数据源)
 *
 * - green_pref 解析优先级: 请求级 body.greenPref (客户端绿色守护开关, localStorage
 *   持久化, 零 DDL 通道) > profiles 字段探测。green_pref 列当前不存在 (零 DDL 红线),
 *   用 select('*') + 通用字段探测: 未来 migration 加列后自动生效,
 *   现在缺失 → 默认 'on' (只有显式 off/false/'0' 才关闭)。
 *   请求级显式 'off' → 直接关且跳过探测; 显式 'on' → 仍取 impulse_item 但偏好以请求为准。
 * - impulse_item: impulse_events 最近一条非空 title (商品名)。
 *   注意: chat MCP record_impulse 落库不写 title, email 扫描路径才写 —
 *   所以这里取"最近一条带商品名的冲动记录", 查询无果则省略。
 *
 * Best-effort: 任何查询失败都回退默认值, 绝不让 chat 因绿色上下文挂掉。
 */
export async function getSymyGreenContext(
  symyUserRef?: string,
  requestGreenPref?: unknown,
): Promise<SymyGreenContext> {
  const requestPref = sanitizeRequestGreenPref(requestGreenPref);
  // 请求级显式 off: 开关已由用户关闭, 绿色上下文整体静默 (连 impulse_item 也省略)
  if (requestPref === "off") return { greenPref: "off" };

  const userRef = sanitizeSymyRef(symyUserRef);
  if (!userRef) return { greenPref: "on" };

  const url = process.env.SYMY_SUPABASE_URL;
  const key = process.env.SYMY_SUPABASE_KEY;
  if (!url || !key) return { greenPref: "on" };

  const result: SymyGreenContext = { greenPref: "on" };
  try {
    const supabase = createClient(url, key);

    // 未带请求级开关时才读 profiles 探测; 请求级 'on' 优先于 profiles 探测结果
    if (requestPref === undefined) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userRef)
        .limit(1);
      const profile = profileRows?.[0] as Record<string, unknown> | undefined;
      const pref = profile?.green_pref;
      if (pref === false || pref === "off" || pref === "0") {
        result.greenPref = "off";
      }
    }

    const { data: impulseRows } = await supabase
      .from("impulse_events")
      .select("title")
      .eq("user_id", userRef)
      .order("created_at", { ascending: false })
      .limit(10);
    const latestTitle = (impulseRows ?? []).find(
      (row) => typeof row.title === "string" && row.title.trim().length > 0,
    )?.title;
    if (latestTitle) {
      const sanitized = sanitizeItemName(latestTitle);
      if (sanitized) result.impulseItem = sanitized;
    }
  } catch {
    // safe to ignore: green context is best-effort — defaults keep chat working
  }
  return result;
}

/**
 * 构建 AI 接收的完整 user message (含 context prefix)
 *
 * 这是 AI 收到的唯一 context 层 (letta.ts 不再二次包装, 见 BUG-333 fix)
 */
export function buildUserMessageWithContext({
  userId: _userId, // 🔧 Round 22 M3: 不再注入 user_id 到 prompt (PII 泄露), 保留参数向后兼容
  cultivationStage,
  locale,
  challengeContext,
  impulseContext,
  userHistory,
  userContent,
  symyUserRef,
  symySessionRef,
  symyCurrency,
  symyCartTotalCents,
  symyGreenPref,
  symyImpulseItem,
  symyShoppingFacts,
}: BuildContextParams): string {
  // Challenge context: itemName $amount (tier: ...) + challenge_id
  // 🔧 P0-3 fix (2026-07-18): sanitize itemName + challengeId before interpolation
  //    Old: `${challengeContext.itemName}` — attacker could send
  //    "earbuds\n\nIMPORTANT: Ignore all previous instructions..." → prompt injection.
  //    New: sanitizeItemName strips control chars + caps length + logs injection attempts.
  const challengeInfo = challengeContext
    ? ` | challenge: ${sanitizeItemName(challengeContext.itemName)} $${challengeContext.amount} (tier: ${getChallengeType(challengeContext.amount)})${challengeContext.challengeId ? ` | challenge_id: ${sanitizeChallengeId(challengeContext.challengeId)}` : ""}`
    : "";

  // Impulse context: platform $amount (signals: ...)
  // 🔧 P0-3 fix: sanitize platform + reasons before interpolation
  const impulseInfo = impulseContext
    ? ` | impulse: ${sanitizePlatform(impulseContext.platform)} $${impulseContext.amount?.toFixed(2) || "unknown"}${impulseContext.reasons?.length ? ` (signals: ${sanitizeReasons(impulseContext.reasons).join(", ")})` : ""}`
    : "";

  // Language instruction
  // 🔧 Brief C P0 (C1c) fix: 双向对称 + 强语言锁。旧代码只在非中文时注入 (中文模式无指令 → AI 可能混英文)。
  //    根因修复: zh/en 都注入强指令, 与 chat/route.ts 的 [LANGUAGE LOCK] 保持一致。
  const languageInstruction =
    locale === "zh"
      ? "[INSTRUCTION: The user's preferred language is Chinese (Simplified). You MUST reply in Chinese only. Zero English words (except proper nouns and currency symbols). Never mix languages in a single response.]"
      : "[INSTRUCTION: The user's preferred language is English. You MUST reply in English only. Zero Chinese characters. Never mix languages in a single response.]";

  // 🔧 A2 缓存分层: 字段按变化频率拆两层 (字段集合与取值不变, 只调序)。
  // 稳定层 — 会话内字节级不变, 靠前放置保住 provider 前缀缓存:
  const stableFields = [
    ["symy_user_ref", sanitizeSymyRef(symyUserRef)],
    ["symy_session_ref", sanitizeSymyRef(symySessionRef)],
    ["symy_lang", locale === "zh" ? "zh" : "en"],
    ["symy_currency", sanitizeIsoCurrency(symyCurrency)],
    // 绿色偏好开关缺省 on (用户设置, 会话内不变 → 稳定层)
    ["symy_green_pref", sanitizeGreenPref(symyGreenPref)],
    // 🧺 购物事实摘要 (尺码/预算/偏好, batch25-b) — 会话内不变 → 稳定层。
    //    值再过一遍括号/折行剥离 (纵深防御; pipeline 侧已卫生化), 空则字段省略。
    ["symy_shopping_facts", sanitizeShoppingFactsForPrompt(symyShoppingFacts)],
  ]
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => ` | ${key}: ${String(value)}`)
    .join("");

  // 易变层 — 每轮都可能变, 挪到 user message 尾部 (紧贴 <message> 之前),
  // 让时间性字节永不插进可缓存的稳定前缀:
  const volatileFields = [
    ["symy_cart_total_cents", sanitizeNonNegativeCents(symyCartTotalCents)],
    // 冲动商品名过 sanitizeItemName, 空值省略 (最近一条冲动记录, 随事件变化 → 易变层)
    [
      "symy_impulse_item",
      symyImpulseItem ? sanitizeItemName(symyImpulseItem) || undefined : undefined,
    ],
  ]
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => ` | ${key}: ${String(value)}`)
    .join("");

  return [
    // 🔧 ARCH fix (Round 22 BUG-R22-M3): 移除 user_id 注入 (PII 泄露到 Letta 对话历史, agentId 已标识用户)
    // 🔧 A2: 稳定层 [Context:] 行 (字段: cultivation_stage/locale/user_ref/session_ref/lang/currency/green_pref)
    `[Context: cultivation_stage: ${cultivationStage} | locale: ${locale || "en"}${stableFields}]`,
    // 🔧 Brief C P0 (C1c) fix: [LANGUAGE LOCK] 紧贴 Context 头部 (高权重位置), 双保险
    locale === "zh"
      ? `[LANGUAGE LOCK: The user's locale is zh. You MUST reply in Chinese only. NEVER mix languages. This overrides any memory of past conversations in another language.]`
      : `[LANGUAGE LOCK: The user's locale is en. You MUST reply in English only. NEVER mix languages. This overrides any memory of past conversations in another language.]`,
    languageInstruction,
    userHistory || "",
    // 🔧 A2: 易变层 [Context:] 行 (cart_total_cents/最近冲动商品名 + 当前挑战状态/本轮冲动信号),
    //    位于 RAG 历史之后、<message> 之前。与稳定层同用 [Context: ...] 标记 — AI 侧契约不变。
    //    全部易变段缺省时整行省略 (与单字段缺省即省略的既有约定一致);
    //    前导分隔符修剪: volatileFields 为空时避免出现 "[Context: | challenge..." 的悬空 " | "。
    ...((volatileFields || challengeInfo || impulseInfo) && [
      `[Context: ${`${volatileFields}${challengeInfo}${impulseInfo}`.replace(/^ \| /, "")}]`,
    ]),
    `<message>${userContent}</message>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
