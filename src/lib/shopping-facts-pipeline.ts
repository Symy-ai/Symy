/**
 * shopping-facts 管道编排件 — batch25-b (简报任务 3) / batch27-b 接 Letta core memory 同步
 *
 * 把休眠的 shopping-facts 落库件 (schema + save/load, A3) 接成活链:
 *   写: extractAndSaveFacts  — 提取器 (确定性, 零 LLM) → saveShoppingFacts 落库。
 *       由 chat route 在用户消息校验通过后 fire-and-forget 调用, 绝不 await 进
 *       响应关键路径; 42P01 表缺失 (migration 140 未跑) → warn + degraded,
 *       不 throw — 表缺席是常态不是事故。
 *       batch27-b: 落库成功且摘要 diff 非空 (新增/变更) 时, 再 fire-and-forget
 *       syncFactsToCoreMemory 把最新摘要镜像进 Letta core memory (单向→双向记忆);
 *       无 diff / 落库失败 / degraded 零 Letta 调用。
 *   读: loadFactsForContext  — loadShoppingFacts → 最近 ≤5 条 (updated_at 新者优先)
 *       → 拼单行摘要 ("size: EU 42 | budget: 预算 500 以内 | preference: 纯棉",
 *       总长 ≤240 字符) 供 Context 稳定层注入。失败/为空 → undefined, 聊天照常。
 *
 * 通道契约 (shopping-facts.ts 头注释): store 由调用方传 createAdminClient()
 * 结果 (service key); 测试注入 stub (照 shopping-facts.test.ts 模式)。
 */

import 'server-only'; // server-only — 编排件只可在服务端使用 (architecture guard #12)

import { logger } from '@/lib/logger';
import { fireAndForgetSafely } from '@/lib/admin-audit';

import { extractShoppingFacts } from './shopping-facts-extract';
import { syncFactsToCoreMemory } from './letta-facts-sync';
import {
  loadShoppingFacts,
  saveShoppingFacts,
  type ShoppingFact,
  type ShoppingFactsReadStore,
  type ShoppingFactsStore,
} from './shopping-facts';

/** Context 注入条数上限 (简报: 最近 ≤5 条) */
export const MAX_CONTEXT_FACTS = 5;
/** Context 注入单行总长上限 (简报: ≤240 字符, 多余按 updated_at 新者优先截断) */
export const MAX_FACTS_SUMMARY_CHARS = 240;

/**
 * 写+读双通道最小结构面。route 边界把 createAdminClient() 结果一次性收窄成它 —
 * 直接把 SupabaseClient 赋给结构面会触发 supabase-js 泛型 TS2589 (实例化过深);
 * 运行时兼容性由 stub 测试 (shopping-facts.test.ts 注入模式) 验证。
 */
export type ShoppingFactsPipelineStore = ShoppingFactsStore & ShoppingFactsReadStore;

export interface ExtractAndSaveFactsParams {
  userId: string | undefined;
  /** 只允许 role='user' 的消息纯文本 — assistant/tool 载荷由调用方挡在门外 */
  text: unknown;
  locale?: 'en' | 'zh';
  /**
   * batch27-b 起为写+读双通道 (ShoppingFactsPipelineStore): Letta 同步的 diff 检测
   * 需要落库前后各读一次。route 本就传组合 store, 契约收窄零生产改动。
   */
  store: ShoppingFactsPipelineStore;
}

export interface ExtractAndSaveFactsResult {
  /** 提取器产出条数 (注入丢弃/无命中 → 0) */
  extracted: number;
  saved: number;
  rejected: number;
  /** true = 表缺失 (migration 140 未跑), 事实未落库但聊天照常 */
  degraded?: boolean;
  error?: string;
}

/**
 * 提取 → 落库 (chat route fire-and-forget 调用)。整体 try/catch 吞异常只留
 * logger.warn — 记忆管线绝不毒死聊天; 42P01 降级语义由 saveShoppingFacts 内建
 * (warn + degraded), 这里透传给调用方做可观测。
 */
export async function extractAndSaveFacts({
  userId,
  text,
  locale,
  store,
}: ExtractAndSaveFactsParams): Promise<ExtractAndSaveFactsResult> {
  const facts = extractShoppingFacts(text, locale);
  if (!userId || facts.length === 0) {
    return { extracted: facts.length, saved: 0, rejected: 0 };
  }
  try {
    // 🧠 batch27-b: 落库前快照 — sync 只在摘要真的变了 (新增/变更) 时才写 Letta block。
    //    两次读都是单索引查询, 且整条路径只在提取命中时走到 (低频), 不在聊天关键路径。
    const before = await loadShoppingFacts(userId, store);
    const result = await saveShoppingFacts(userId, facts, store);
    if (result.saved > 0 && !result.degraded) {
      const after = await loadShoppingFacts(userId, store);
      if (buildFactsSummary(after.facts) !== buildFactsSummary(before.facts)) {
        // fire-and-forget: 与提取同款时序铁律 — sync 绝不进聊天响应关键路径;
        // syncFactsToCoreMemory 内部全吞异常, fireAndForgetSafely 再延长 Vercel 生命周期。
        fireAndForgetSafely(syncFactsToCoreMemory(userId, after.facts));
      }
    }
    return {
      extracted: facts.length,
      saved: result.saved,
      rejected: result.rejected,
      degraded: result.degraded,
      error: result.error,
    };
  } catch (err) {
    // safe to ignore: 落库失败不阻断聊天 (fire-and-forget 路径, 只留 warn 级可观测)
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[ShoppingFactsPipeline] extractAndSaveFacts failed:', message);
    return { extracted: facts.length, saved: 0, rejected: 0, error: message };
  }
}

export interface LoadFactsForContextParams {
  userId: string | undefined;
  store: ShoppingFactsReadStore;
}

/**
 * 读取 → 拼单行摘要 (chat route 每轮 context 构建时 await, 单索引查询
 * idx_shopping_facts_user_updated)。任何失败 (表缺失/查询错误/为空) →
 * undefined, 调用方按字段缺省省略注入。
 */
export async function loadFactsForContext({
  userId,
  store,
}: LoadFactsForContextParams): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const { facts, degraded, error } = await loadShoppingFacts(userId, store);
    if (degraded || error || facts.length === 0) return undefined;
    return buildFactsSummary(facts);
  } catch (err) {
    // safe to ignore: facts 注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[ShoppingFactsPipeline] loadFactsForContext failed:', message);
    return undefined;
  }
}

/**
 * facts → 单行摘要 ("size: EU 42 | budget: 预算 500 以内 | preference: 纯棉")。
 * facts 约定已按 updated_at 新→旧排 (loadShoppingFacts 保证), ≤5 条内贪心拼接,
 * 总长超 240 即停 — 新者优先留下, 旧者截弃。
 * 纵深防御: value 再过一遍括号/尖括号剥离 + 空白压平 (buildShoppingFact 卫生化
 * 之外的第二道), 防历史脏行把 "[Context:" / 换行带进 prompt 稳定层。
 */
export function buildFactsSummary(facts: readonly ShoppingFact[]): string | undefined {
  const segments: string[] = [];
  let total = 0;
  for (const fact of facts.slice(0, MAX_CONTEXT_FACTS)) {
    const value = stripInjectionResidue(fact.value);
    if (!value) continue;
    const segment = `${fact.category}: ${value}`;
    if (segments.length === 0) {
      // 第一段自身超限 → 丢弃该段继续 (硬截会拼出半句话)
      if (segment.length > MAX_FACTS_SUMMARY_CHARS) continue;
      segments.push(segment);
      total = segment.length;
      continue;
    }
    const added = total + 3 + segment.length; // ' | '.length === 3
    if (added > MAX_FACTS_SUMMARY_CHARS) break;
    segments.push(segment);
    total = added;
  }
  const line = segments.join(' | ');
  return line.length > 0 ? line : undefined;
}

/** 括号/尖括号/花括号剥离 + 控制字符与连续空白压平 (纵深防御第二道) */
function stripInjectionResidue(value: string): string {
  return value
    .replace(/[\[\]{}()<>]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
