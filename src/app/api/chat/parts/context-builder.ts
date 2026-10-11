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

// 🔧 R1065 收编 (R1064 观察项25): buildUserMessageWithContext + buildGreenAlternativesContext
//    删除 — BUG-333 重构后 letta-turn-context 内联 symyFields 成为唯一活 context 构建,
//    两函数生产消费面零 (仅 __tests__ 直调)。连带死链: getChallengeType / GREEN_ALTERNATIVES
//    / CultivationStage / BuildContextParams 随删。活函数保留: getSymyCartTotalCents /
//    getSymyGreenContext / sanitizeShoppingFactsForPrompt (letta-turn-context 主链消费)
//    + sanitize 家族 (UUID/currency/cents/greenPref) + SymyGreenContext 类型。
// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): ImpulseContext 单一 source of truth
import type { ImpulseContext } from "@/types/impulse-context";
import { createClient } from "@supabase/supabase-js";
export type { ImpulseContext };
import { sanitizeItemName } from "./prompt-sanitizer";
import { logger } from "@/lib/logger";
import { warnMissingEnvOnce } from "@/lib/env-consumers";

export interface SymyGreenContext {
  greenPref: "on" | "off";
  impulseItem?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeSymyRef(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value.trim()) ? value.trim() : undefined;
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
  if (!url || !key) {
    warnMissingEnvOnce("Symy external shopping context");
    return undefined;
  }
  if (!userRef) return undefined;

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
  if (!url || !key) {
    warnMissingEnvOnce("Symy external shopping context");
    return { greenPref: "on" };
  }

  const result: SymyGreenContext = { greenPref: "on" };
  try {
    const supabase = createClient(url, key);

    // 🔧 latency+dead-code fix: 原 profiles 探测读 green_pref — 该列在 profiles 上
    //    不存在(列守卫证实), select('*') cast 后永远 undefined, 探测分支是死代码 → 删除。
    //    requestPref 仍是权威开关(调用方传入); impulse_events 查询保持不变。
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

