/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
// Letta core memory 同步件 — batch27-b (shopping-facts.ts OPEN QUESTIONS #2 兑现).
//
// 25-b 落地的提取管道是单向记忆: 本地表记住了 (可查询、可审计), 但 Letta 小象自己的
// 脑 (core memory) 不知道 — 换 agent / 重建 agent / context 注入串没拼上时, 小象就把
// 用户忘了。本件把本地 facts 镜像进该用户 per-user agent 的 `shopping_facts` block:
//   写: syncFactsToCoreMemory — 全量覆写 (block = 当前最新 facts 摘要行, 非 append);
//       本地表是 source of truth, block 只是缓存镜像。由 extractAndSaveFacts 在
//       落库成功且摘要 diff 非空时 fire-and-forget 调用 (绝不 await 进聊天关键路径)。
//   读: getFactsBlockPreview — 读回 block 当前值 (测试与将来 UI 用), best-effort null。
//
// 失败语义: Letta 不可用 / agent 不存在 / 4xx / 5xx 一律 try/catch 吞异常只留 warn —
// 与 extractAndSaveFacts 同款「绝不影响聊天主链路」; 不重试不队列不落重试态。
// PII 红线 (letta-agent-manager.ts:157): userEmail/手机号等绝不进 block — 值逐条过
// sanitizeLabel + 括号/折行剥离 + isIdentifierShaped 形状过滤 (提取器已整条丢弃注入串,
// 这里是第二道防御, 防历史脏行经 loadShoppingFacts 复检漏网)。
//
// 分层铁律: 只被 shopping-facts-pipeline 单向依赖 — 不反向 import pipeline (架构守卫
// 禁 src/lib/ 循环依赖), 故摘要拼行逻辑在此自持 (与 buildFactsSummary 同款, 刻意不共享)。

import 'server-only'; // server-only — 同步件只可在服务端使用 (architecture guard #12)

import { logger } from '@/lib/logger';
import { sanitizeLabel } from '@/lib/fencing';
import { isIdentifierShaped, type ShoppingFact } from '@/lib/shopping-facts';
import { getUserAgentId } from '@/lib/letta-agent-manager';
import { lettaAPI, LettaAPIError } from '@/lib/letta-mcp-manager';

/** core memory block label (照 agent-manager 既有 memory_blocks 结构: { label, value, limit }) */
export const SHOPPING_FACTS_BLOCK_LABEL = 'shopping_facts';
/** block 容量上限 — 摘要 ≤240 字符, 500 给足余量且量级对齐 user_id 块 (limit 100) 与 persona 块 */
export const SHOPPING_FACTS_BLOCK_LIMIT = 500;
/** 与 pipeline MAX_CONTEXT_FACTS / MAX_FACTS_SUMMARY_CHARS 同源 (不 import — 防循环依赖) */
const MAX_BLOCK_FACTS = 5;
const MAX_BLOCK_CHARS = 240;

/**
 * 节流: 同 user 5 分钟窗口内不重复同步。模块级内存时间戳即可, 无需持久层 —
 * 目的只是避免每条消息都打 Letta API (提取命中是低频事件, 5 分钟陈旧无感知);
 * serverless 重启丢状态最坏多打一次 API, 无正确性影响。
 */
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const lastSyncAtByUser = new Map<string, number>();

/** 测试钩子: 清空节流表 (vitest beforeEach 用, 生产勿调) */
export function resetFactsSyncThrottleForTests(): void {
  lastSyncAtByUser.clear();
}

/**
 * 把 ≤5 条 facts 摘要全量覆写进该用户 per-user agent 的 shopping_facts block。
 * 永不 throw — 任何失败降级 no-op + warn 级日志, 调用方 (pipeline fire-and-forget) 无感知。
 */
export async function syncFactsToCoreMemory(userId: string, facts: readonly ShoppingFact[]): Promise<void> {
  if (!userId || facts.length === 0) return;

  const now = Date.now();
  const lastSyncAt = lastSyncAtByUser.get(userId);
  if (lastSyncAt !== undefined && now - lastSyncAt < SYNC_THROTTLE_MS) return; // 节流窗口内 → no-op

  try {
    const content = buildBlockContent(facts);
    if (!content) return;

    const agentId = await getUserAgentId(userId);
    if (!agentId) {
      // 只查不建 (getUserAgentId) — 小象 agent 尚未存在时静默放弃, 下次 facts 变更再试
      logger.warn(`[LettaFactsSync] no agent for user, skipping sync (userId hash: ${userId.substring(0, 8)}…)`);
      return;
    }

    // 占窗在真正触碰 Letta 之前 — agent 缺席/内容为空不烧窗口, 写失败不重试 (降级语义)
    lastSyncAtByUser.set(userId, now);
    await writeFactsBlock(agentId, content);
    logger.info(`[LettaFactsSync] shopping_facts block synced (${content.length} chars)`);
  } catch (err) {
    // safe to ignore: sync 是缓存镜像维护, 绝不影响聊天主链路 — 降级 no-op 只留 warn
    logger.warn('[LettaFactsSync] syncFactsToCoreMemory failed (degraded to no-op):', err instanceof Error ? err.message : String(err));
  }
}

/**
 * 读回该用户 agent 的 shopping_facts block 当前值 (测试与将来 UI 用)。
 * best-effort: agent 缺席 / block 不存在 / Letta 失败 → null, 永不 throw。
 */
export async function getFactsBlockPreview(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const agentId = await getUserAgentId(userId);
    if (!agentId) return null;
    const response = await lettaAPI(`/agents/${agentId}/core-memory`);
    const memory = (await response.json()) as { blocks?: Array<{ label?: unknown; value?: unknown }> } | null;
    const block = memory?.blocks?.find((b) => b?.label === SHOPPING_FACTS_BLOCK_LABEL);
    return typeof block?.value === 'string' ? block.value : null;
  } catch (err) {
    // safe to ignore: preview 是 best-effort 读侧 — 失败静默 null (调用方按无 block 处理)
    logger.warn('[LettaFactsSync] getFactsBlockPreview failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** 写 block: 先 PATCH 更新 (稳态一次调用); 404 = 老 agent 没有此块 → POST 首次创建 */
async function writeFactsBlock(agentId: string, content: string): Promise<void> {
  try {
    await lettaAPI(`/agents/${agentId}/core-memory/blocks/${SHOPPING_FACTS_BLOCK_LABEL}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: content }),
    });
  } catch (err) {
    if (err instanceof LettaAPIError && err.status === 404) {
      await lettaAPI(`/agents/${agentId}/core-memory/blocks`, {
        method: 'POST',
        body: JSON.stringify({ label: SHOPPING_FACTS_BLOCK_LABEL, value: content, limit: SHOPPING_FACTS_BLOCK_LIMIT }),
      });
      return;
    }
    throw err;
  }
}

/**
 * facts → block 内容 (单行 "size: EU 42 | budget: 预算 500 以内")。
 * 与 pipeline buildFactsSummary 同款贪心拼接 (≤5 条, ≤240, 新者优先留下) — 不共享代码
 * 是为了保持 pipeline → sync 单向依赖 (架构守卫禁 src/lib/ 循环依赖)。
 * PII/注入纵深防御: 每条 value 过括号/折行剥离 + isIdentifierShaped 形状过滤,
 * category 过 sanitizeLabel — "[/Context:" 伪造 marker 经剥离后失去 prompt 语法。
 */
function buildBlockContent(facts: readonly ShoppingFact[]): string | undefined {
  const segments: string[] = [];
  let total = 0;
  for (const fact of facts.slice(0, MAX_BLOCK_FACTS)) {
    const value = stripInjectionResidue(fact.value);
    if (!value || isIdentifierShaped(value)) continue;
    const segment = `${sanitizeLabel(fact.category, 64)}: ${value}`;
    if (segments.length === 0) {
      if (segment.length > MAX_BLOCK_CHARS) continue; // 首段自身超限 → 丢弃该段继续
      segments.push(segment);
      total = segment.length;
      continue;
    }
    const added = total + 3 + segment.length; // ' | '.length === 3
    if (added > MAX_BLOCK_CHARS) break;
    segments.push(segment);
    total = added;
  }
  const line = segments.join(' | ');
  return line.length > 0 ? line : undefined;
}

/** 括号/尖括号/花括号剥离 + 控制字符与连续空白压平 (与 pipeline 同款第二道防御) */
function stripInjectionResidue(value: string): string {
  return value
    .replace(/[\[\]{}()<>]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
