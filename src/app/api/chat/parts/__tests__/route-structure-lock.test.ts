/**
 * route-structure-lock — chat/route.ts 拆相位 (Lane G 方案) 批 0 结构锁
 *
 * 职责: 读 route.ts 源文本, 锁定拆分前的调用链序 — 后续每一刀 (刀 18-24) 搬移
 * 相位到 parts/ 时, 该文件锚点随之更新, 调用顺序 (源码位置序) 必须保持不变。
 * 这是"纯结构性拆分"的源码级判定; 字节级判定由 route-sse-bytes.test.ts 快照承担。
 *
 * 锚点设计 (与既有 6 个 source-order 测试同模式, readFileSync + indexOf):
 * - 相位锚 = 调用点精确文本 (含 await 与开括号), 每锚在本文件断言 count=1
 *   (防"锚文本因搬移消失 → indexOf=-1 → 比较恒真"的空转假绿, 方案 §6 风险 3)
 * - canned 块锚 = await tryXxxBlock( 调用点; 18 块链序逐一锁定 (刀 21 起 clarify 三态块入列)
 *   🔧 拆相位第25刀随动 (批4方案B): 18 块链整段搬移 parts/canned-chain.ts, 块锚
 *   改读链文件源文本 (调用顺序=链序语义等价, 刀 20 letta-unavailable 先例);
 *   route 侧新增链单锚 `await runCannedBlockChain(` (count=1)。
 * - 行号会随拆分漂移, 本文件只锁相对顺序不锁行号 (方案基于 03d66a6,
 *   本文件基于 8c163fb 之后的实际内容, 相位与方案 §1 相位表一致)
 *
 * 与方案预期的两处出入 (实际为准, 记录差异 — 简报刀 0a 要求):
 * - 方案相位表 P1 将"IP 识别拒头"写作独立行, 实际 route.ts 中 IP 判定是
 *   checkRateLimit 调用前的 clientIp 表达式 + 拒头 if, 本锁以
 *   `await checkRateLimit(` 的首次出现为准 (IP 拒头在其之前, 语义已覆盖)
 * - 方案预期 `checkRateLimit` 为单锚, 实际出现 2 次 (小时限 + free-tier 日限),
 *   本锁断言两次调用均在 isLettaConfigured 门之前
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../route.ts', import.meta.url), 'utf-8');
/** 🔧 第25刀随动: 18 块 canned 链已搬 parts/canned-chain.ts — 块锚改读链文件源文本 */
const chainSource = readFileSync(new URL('../canned-chain.ts', import.meta.url), 'utf-8');

/** 相位锚必须恰好出现 1 次 (调用点唯一), 否则锚已空转 */
function anchor(pattern: string): number {
  const count = source.split(pattern).length - 1;
  expect(count, `相位锚 ${JSON.stringify(pattern)} 应恰好出现 1 次 (实际 ${count}) — 搬移后锚点未随动或文本漂移`).toBe(1);
  return source.indexOf(pattern);
}

/** canned 块调用锚 — `await tryXxx(` 或 `await runXxx(` 形式, 链文件内恰好 1 次调用 */
function blockAnchor(name: string): number {
  const pattern = `await ${name}(`;
  const count = chainSource.split(pattern).length - 1;
  expect(count, `canned 块锚 ${JSON.stringify(pattern)} 应在 canned-chain.ts 内恰好出现 1 次 (实际 ${count}) — 搬移后锚点未随动或文本漂移`).toBe(1);
  return chainSource.indexOf(pattern);
}

describe('route-structure-lock — 7 相位锚顺序 (拆分不可漂移)', () => {
  it('validateChatRequest → createAuthenticatedClient → checkRateLimit → isLettaConfigured → loadLettaTurnContext → dispatchLettaTurn', () => {
    // 🔧 拆相位第24刀随动: streamToAgent/processLettaResponse 调用点已随分发段
    // 迁入 parts/letta-dispatch.ts (本 describe 内锚读 route.ts), route 侧锁
    // dispatchLettaTurn 唯一调用点; 两个 letta 调用锚迁至下方 parts 源文本测试。
    const validate = anchor('await validateChatRequest(');
    const auth = anchor('await createAuthenticatedClient(');
    const hourlyRateLimit = anchor('await checkChatRateLimit(');
    const lettaGate = anchor('isLettaConfigured()');
    const loadContext = anchor('await loadLettaTurnContext({');
    const dispatch = anchor('await dispatchLettaTurn({');

    // P0 < P1 < P2 门 < P3 < P5 分发调用
    expect(validate).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(validate);
    expect(hourlyRateLimit).toBeGreaterThan(auth);
    expect(lettaGate).toBeGreaterThan(hourlyRateLimit);
    expect(loadContext).toBeGreaterThan(lettaGate);
    expect(dispatch).toBeGreaterThan(loadContext);
  });

  it('P5 分发体内: streamToAgent/processLettaResponse 均在 dispatch 之内 (锚迁 parts/letta-dispatch.ts)', () => {
    // 🔧 拆相位第24刀随动: 两个 Letta 调用点随分发段迁入 parts/letta-dispatch.ts,
    // 锁其在新家的源文本 (流式 streamToAgent 先于非流式 processLettaResponse,
    // 与拆分前 route 内 if(stream) 分支序一致)。
    const partSource = readFileSync(new URL('../letta-dispatch.ts', import.meta.url), 'utf-8');
    const partAnchor = (pattern: string) => {
      const count = partSource.split(pattern).length - 1;
      expect(count, `letta-dispatch 锚 ${JSON.stringify(pattern)} 应恰好出现 1 次 (实际 ${count})`).toBe(1);
      return partSource.indexOf(pattern);
    };
    const stream = partAnchor('await streamToAgent(');
    const nonStream = partAnchor('await processLettaResponse(');
    const buildPipeline = partAnchor('buildSsePipeline({');
    expect(stream).toBeGreaterThan(-1);
    expect(nonStream).toBeGreaterThan(stream);
    expect(buildPipeline).toBeGreaterThan(stream);
  });

  it('free-tier 日限 (第 2 次 checkRateLimit) 也在 isLettaConfigured 门之前', () => {
    const lettaGate = anchor('isLettaConfigured()');
    const dailyRateLimit = anchor('await checkDailyChatLimit(');
    expect(dailyRateLimit).toBeLessThan(lettaGate);
  });

  it('P4 getUserAgentId 在 P3 装载之后、P5 分发之前', () => {
    const loadContext = anchor('await loadLettaTurnContext({');
    const getUserAgent = anchor('await getUserAgentId(');
    // 🔧 拆相位第24刀随动: streamToAgent 已迁 parts/letta-dispatch.ts,
    // route 侧 P5 分界锚 = dispatchLettaTurn 调用点
    const dispatch = anchor('await dispatchLettaTurn({');
    expect(getUserAgent).toBeGreaterThan(loadContext);
    expect(getUserAgent).toBeLessThan(dispatch);
  });

  it('P2 facts fire-and-forget 在 canned 链调用之前 (原锁链首, 第25刀后锁链单锚)', () => {
    // 方案 §6 风险 5: facts 提取时序敏感, 留在链头 — 第25刀后 18 块链在
    // parts/canned-chain.ts, route 侧锁 facts 在 runCannedBlockChain 调用之前
    // (链内首块 retro-answer 仍在 facts 之后, 链文件序不变)
    const facts = anchor('extractAndSaveFacts({');
    const chain = anchor('await runCannedBlockChain({');
    expect(facts).toBeLessThan(chain);
  });

  it('P3 装载在 canned 链之后: lettaGate < chain < loadContext', () => {
    // 🔧 拆相位第25刀随动: 18 块链搬 parts/canned-chain.ts, route 侧以链单锚
    // 参与 7 相位序 (letta 门内: 链 → loadLettaTurnContext → getUserAgentId → dispatch)
    const lettaGate = anchor('isLettaConfigured()');
    const chain = anchor('await runCannedBlockChain({');
    const loadContext = anchor('await loadLettaTurnContext({');
    expect(lettaGate).toBeGreaterThan(-1);
    expect(chain).toBeGreaterThan(lettaGate);
    expect(loadContext).toBeGreaterThan(chain);
  });
});

describe('route-structure-lock — 18 canned 块链序 (b137 全量块, 调用序=链序)', () => {
  it('块调用顺序与 canned-chain.ts 现链一致 (source-order 集中锚)', () => {
    // 🔧 拆相位第25刀随动: 18 块链整段搬 parts/canned-chain.ts (批4方案B),
    // 集中锚改读链文件源文本 — 调用顺序=链序, 语义等价 (count=1 纪律保持)
    const order = [
      'runGreenAltRetroAnswerBlock', // batch68-a 采纳后复盘回答
      'tryGreenAltRetroAskBlock',    // batch68-a 复盘追问
      'tryReflectionBlock',          // P0-1 反思问题
      'tryCooldownBlock',            // batch48-b 反驳降温
      'tryDuplicatePurchaseBlock',   // batch65-a 重复购买预检
      'tryPrepurchaseBlock',         // batch50-a 买前三问
      'tryCommitmentBlock',          // batch53-a 绿色承诺
      'tryCompareBlock',             // batch56-a 对比裁决
      'tryListTriageBlock',          // batch57-a 清单分诊
      'tryFollowUpBlock',            // batch59-c 追问跟随
      'tryCategoryQueryBlock',       // batch58-c 分类问句
      'tryImpulseTimeQueryBlock',    // batch58-c 时段问句
      'tryImpulseForecastBlock',     // batch62-c 冲动风险预报
      'tryGuardPulseBlock',          // batch68-c 守护脉搏
      'trySavingsQueryBlock',        // batch57-c 问账
      'tryShoppingClarifyBlock',     // 三态块: clarify 短路 / not_purchase 旗标 / null 直通
      'tryEmotionGuardBlock',        // batch60-c 情绪守护 (clarify 之后, 消费旗标)
      'tryContextSignalBlock',       // batch61-b 购物场景弱信号
    ].map(blockAnchor);

    for (let i = 1; i < order.length; i++) {
      expect(order[i], `canned 块 #${i} (${i === 16 ? 'emotion-guard' : 'block'}) 必须在前一块之后`).toBeGreaterThan(order[i - 1]);
    }
  });

  it('shopping-clarify 三态块在 emotion-guard 之前 (suppressGuardCards 消费方在后)', () => {
    // 方案批 2 (刀 21): clarify 三态块须在 emotion-guard 之前 — 🔧b137随动:
    // 内联段已拆出, classifyShoppingIntent 锚改块调用点 (调用顺序=链序)
    // 🔧 第25刀随动: 两块均已迁 parts/canned-chain.ts, blockAnchor 读链文件源文本
    const clarify = blockAnchor('tryShoppingClarifyBlock');
    const emotion = blockAnchor('tryEmotionGuardBlock');
    expect(clarify).toBeLessThan(emotion);
  });

  it('懒加载机器锁: 链文件内 await import("./canned/ 恰好 18 次 (外层懒加载不可改静态)', () => {
    // 方案 §1.4/§3.4: 外层 await import 逐块保留 — 短路请求不加载后续块模块。
    // 后人"顺手"改成静态 import 会破坏短路省加载语义, 此锁防退化。
    const count = chainSource.split("await import('./canned/").length - 1;
    expect(count, 'canned-chain.ts 应含且仅含 18 处 await import("./canned/*") 外层懒加载').toBe(18);
  });

  it('缝序机器锁: suppressGuardCards let 初始化在 clarify 块之前、emotion/context-signal 消费在后', () => {
    // 方案 §1.2 缝1: let suppressGuardCards = false (块16 前) → 块16 写 → 块17/18 读。
    // let 声明原位保留在链文件 — 锁初始化点 < clarify 调用 < 两个消费方调用。
    const init = chainSource.indexOf('let suppressGuardCards = false');
    const clarify = blockAnchor('tryShoppingClarifyBlock');
    const emotion = blockAnchor('tryEmotionGuardBlock');
    const contextSignal = blockAnchor('tryContextSignalBlock');
    expect(init, '链文件应含 let suppressGuardCards = false 初始化 (缝1 原位保留)').toBeGreaterThan(-1);
    expect(init).toBeLessThan(clarify);
    expect(clarify).toBeLessThan(emotion);
    expect(emotion).toBeLessThan(contextSignal);
  });
});

describe('route-structure-lock — P5 SSE 包装栈层序 (字节序红线)', () => {
  it('包装顺序: audit → websearch → reuse → green_alt → green_knowledge → alt_footprint → micro', () => {
    // 方案 §1 SSE 包装栈: "谁后包装谁更靠前" — 源码调用序锁定拆分后的包装序。
    // 🔧b137随动 (刀23): 包装栈本体已拆出 parts/sse-pipeline.ts, 锚迁该文件内部
    // (调用顺序=包装序=字节序); prependReuseHintEvent 两处调用用首参区分锚。
    const partSource = readFileSync(new URL('../sse-pipeline.ts', import.meta.url), 'utf-8');
    const partAnchor = (pattern: string) => {
      const count = partSource.split(pattern).length - 1;
      expect(count, `sse-pipeline 锚 ${JSON.stringify(pattern)} 应恰好出现 1 次 (实际 ${count})`).toBe(1);
      return partSource.indexOf(pattern);
    };
    const audit = partAnchor('wrapStreamWithAudit(');
    const websearch = partAnchor('withWebSearchWaitEvent(');
    const reuse = partAnchor('prependReuseHintEvent(webSearchWaitStream');
    const greenAlt = partAnchor('withGreenAltEvent(');
    const greenKnowledge = partAnchor('withGreenKnowledgeEvent(');
    const altFootprint = partAnchor('withAltFootprintEvent(');
    // micro 挑战: 包在 sseBody 上 (最后包装 → 排最前)
    const micro = partAnchor('prependReuseHintEvent(sseBody');

    expect(audit).toBeLessThan(websearch);
    expect(websearch).toBeLessThan(reuse);
    expect(reuse).toBeLessThan(greenAlt);
    expect(greenAlt).toBeLessThan(greenKnowledge);
    expect(greenKnowledge).toBeLessThan(altFootprint);
    expect(altFootprint).toBeLessThan(micro);
  });

  it('SSE 包装栈整体在 streamToAgent 之后 (先有 innerStream 再包装)', () => {
    // 🔧b137随动 (刀23): 包装锚已迁 sse-pipeline.ts, 此处锁 dispatch 侧接线序 —
    // streamToAgent 产出 innerStream 在前, buildSsePipeline 消费在后
    // 🔧 拆相位第24刀随动: 两调用点均已迁 parts/letta-dispatch.ts, 接线序在新家锁定
    const partSource = readFileSync(new URL('../letta-dispatch.ts', import.meta.url), 'utf-8');
    const count = (pattern: string) => partSource.split(pattern).length - 1;
    expect(count('await streamToAgent('), 'letta-dispatch 应含且仅含 1 次 streamToAgent 调用').toBe(1);
    expect(count('buildSsePipeline({'), 'letta-dispatch 应含且仅含 1 次 buildSsePipeline 调用').toBe(1);
    expect(partSource.indexOf('buildSsePipeline({')).toBeGreaterThan(partSource.indexOf('await streamToAgent('));
  });
});

describe('route-structure-lock — 平台层不可动 (Vercel 语义)', () => {
  it('maxDuration 与 POST 导出存在', () => {
    expect(source).toContain('export const maxDuration = 60');
    expect(source).toContain('export async function POST(');
  });

  it('P6 出口兜底: 未登录 401 在前、503 在后 (第20刀拆出 parts/letta-unavailable.ts)', () => {
    // 锚随动 (刀20): P6 两个 return 本体已下沉 parts/letta-unavailable.ts,
    // route 侧锚 = 唯一调用点; 401→503 顺序锁移到 parts 文件内部 (顺序断言不动)
    const lettaUnavailable = anchor('return lettaUnavailableResponse(');
    const gate = anchor('isLettaConfigured()');
    expect(lettaUnavailable).toBeGreaterThan(gate);

    const partSource = readFileSync(new URL('../letta-unavailable.ts', import.meta.url), 'utf-8');
    const authRequired = partSource.indexOf("error: 'Authentication required");
    const unavailable = partSource.indexOf("error: 'AI service temporarily unavailable");
    expect(authRequired, 'parts/letta-unavailable.ts 应含 401 Authentication required 文案').toBeGreaterThan(-1);
    expect(unavailable, 'parts/letta-unavailable.ts 应含 503 AI service unavailable 文案').toBeGreaterThan(-1);
    expect(unavailable).toBeGreaterThan(authRequired);
  });
});
