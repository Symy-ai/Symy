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
 * - canned 块锚 = await tryXxxBlock( 调用点; 17 块链序逐一锁定
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

/** 相位锚必须恰好出现 1 次 (调用点唯一), 否则锚已空转 */
function anchor(pattern: string): number {
  const count = source.split(pattern).length - 1;
  expect(count, `相位锚 ${JSON.stringify(pattern)} 应恰好出现 1 次 (实际 ${count}) — 搬移后锚点未随动或文本漂移`).toBe(1);
  return source.indexOf(pattern);
}

/** canned 块调用锚 — `await tryXxx(` 或 `await runXxx(` 形式, 恰好 1 次调用 */
function blockAnchor(name: string): number {
  return anchor(`await ${name}(`);
}

describe('route-structure-lock — 7 相位锚顺序 (拆分不可漂移)', () => {
  it('validateChatRequest → createAuthenticatedClient → checkRateLimit → isLettaConfigured → loadLettaTurnContext → streamToAgent → processLettaResponse', () => {
    const validate = anchor('await validateChatRequest(');
    const auth = anchor('await createAuthenticatedClient(');
    const hourlyRateLimit = anchor('await checkChatRateLimit(');
    const lettaGate = anchor('isLettaConfigured()');
    const loadContext = anchor('await loadLettaTurnContext({');
    const stream = anchor('await streamToAgent(');
    const nonStream = anchor('await processLettaResponse(');

    // P0 < P1 < P2 门 < P3 < P5 (流式与非流式互斥分支, 两者都在 P3/P4 之后)
    expect(validate).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(validate);
    expect(hourlyRateLimit).toBeGreaterThan(auth);
    expect(lettaGate).toBeGreaterThan(hourlyRateLimit);
    expect(loadContext).toBeGreaterThan(lettaGate);
    expect(stream).toBeGreaterThan(loadContext);
    expect(nonStream).toBeGreaterThan(loadContext);
  });

  it('free-tier 日限 (第 2 次 checkRateLimit) 也在 isLettaConfigured 门之前', () => {
    const lettaGate = anchor('isLettaConfigured()');
    const dailyRateLimit = anchor('await checkDailyChatLimit(');
    expect(dailyRateLimit).toBeLessThan(lettaGate);
  });

  it('P4 getUserAgentId 在 P3 装载之后、P5 分发之前', () => {
    const loadContext = anchor('await loadLettaTurnContext({');
    const getUserAgent = anchor('await getUserAgentId(');
    const stream = anchor('await streamToAgent(');
    expect(getUserAgent).toBeGreaterThan(loadContext);
    expect(getUserAgent).toBeLessThan(stream);
  });

  it('P2 facts fire-and-forget 在第一个 canned 块 (retro-answer) 之前', () => {
    // 方案 §6 风险 5: facts 提取时序敏感, 留在链头 — 锁其在 17 块链首之前
    const facts = anchor('extractAndSaveFacts({');
    const firstBlock = blockAnchor('runGreenAltRetroAnswerBlock');
    expect(facts).toBeLessThan(firstBlock);
  });
});

describe('route-structure-lock — 17 canned 块链序 (b137 全量块, 调用序=链序)', () => {
  it('块调用顺序与 route 现链一致 (source-order 集中锚)', () => {
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
      'tryEmotionGuardBlock',        // batch60-c 情绪守护 (clarify 之后)
      'tryContextSignalBlock',       // batch61-b 购物场景弱信号
    ].map(blockAnchor);

    for (let i = 1; i < order.length; i++) {
      expect(order[i], `canned 块 #${i} (${i === 15 ? 'emotion-guard' : 'block'}) 必须在前一块之后`).toBeGreaterThan(order[i - 1]);
    }
  });

  it('shopping-clarify 内联段在 emotion-guard 之前 (suppressGuardCards 消费方在后)', () => {
    // 方案批 2 (刀 21): clarify 三态块须在 emotion-guard 之前 — 现内联段的
    // classifyShoppingIntent 锚即未来 tryShoppingClarifyBlock 的链序位置
    const clarify = anchor('classifyShoppingIntent({');
    const emotion = blockAnchor('tryEmotionGuardBlock');
    expect(clarify).toBeLessThan(emotion);
  });
});

describe('route-structure-lock — P5 SSE 包装栈层序 (字节序红线)', () => {
  it('包装顺序: audit → websearch → reuse → green_alt → green_knowledge → alt_footprint → micro', () => {
    // 方案 §1 SSE 包装栈: "谁后包装谁更靠前" — 源码调用序锁定拆分后的包装序。
    // prependReuseHintEvent 有两处调用 (reuse 预注入 + micro 预注入), 用首参区分锚
    const audit = anchor('wrapStreamWithAudit(');
    const websearch = anchor('withWebSearchWaitEvent(');
    const reuse = anchor('prependReuseHintEvent(webSearchWaitStream');
    const greenAlt = anchor('withGreenAltEvent(');
    const greenKnowledge = anchor('withGreenKnowledgeEvent(');
    const altFootprint = anchor('withAltFootprintEvent(');
    // micro 挑战: 包在 sseBody 上 (最后包装 → 排最前)
    const micro = anchor('prependReuseHintEvent(sseBody');

    expect(audit).toBeLessThan(websearch);
    expect(websearch).toBeLessThan(reuse);
    expect(reuse).toBeLessThan(greenAlt);
    expect(greenAlt).toBeLessThan(greenKnowledge);
    expect(greenKnowledge).toBeLessThan(altFootprint);
    expect(altFootprint).toBeLessThan(micro);
  });

  it('SSE 包装栈整体在 streamToAgent 之后 (先有 innerStream 再包装)', () => {
    const stream = anchor('await streamToAgent(');
    const audit = anchor('wrapStreamWithAudit(');
    expect(audit).toBeGreaterThan(stream);
  });
});

describe('route-structure-lock — 平台层不可动 (Vercel 语义)', () => {
  it('maxDuration 与 POST 导出存在', () => {
    expect(source).toContain('export const maxDuration = 60');
    expect(source).toContain('export async function POST(');
  });

  it('P6 出口兜底: 未登录 401 在前、503 在后 (isLettaConfigured 门外的两个 return)', () => {
    // 锚 P6 段两个 return 的完整调用文本 (错误字符串本身在 P5 错误分支先出现)
    const authRequired = anchor("return mergeCookies(NextResponse.json({ error: 'Authentication required");
    const unavailable = anchor("return mergeCookies(NextResponse.json({ error: 'AI service temporarily unavailable");
    expect(unavailable).toBeGreaterThan(authRequired);
  });
});
