/**
 * 请求体解析与校验。
 *
 * 职责：content-type / body 大小检查 + zod schema 校验 + 归一化（locale / null→undefined /
 * safeMessages）。校验失败时的错误响应（status + body）与 route.ts 原实现逐字节一致。
 *
 * 纯机械搬移自 route.ts batch26-c（行为逐字节等价；zod schema 提升为模块级常量——
 * schema 构造是纯函数，逐请求重建与模块级单例语义相同）。
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

// 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
//    旧代码: body as { ... } cast + 多处 typeof/length 检查 — 容易漏字段, prototype pollution 风险
//    根因修复: zod schema 一次性验证所有字段, 自动 sanitize + 类型推导
const chatSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']).catch('user'),
          content: z.string().max(10000),
        }),
      )
      .min(1, 'messages is required and must be a non-empty array')
      .max(50, 'Too many messages. Maximum 50 messages per request.'),
    // 🔧 Mirror-mode fix: .nullable().optional() — client sends `null` (not undefined) when no context.
    //    zod .optional() accepts undefined but rejects null by default, causing 400 on every challenge.
    impulseContext: z
      .object({
        platform: z.string().max(100).optional(),
        amount: z.number().finite().min(0).max(1_000_000).optional(),
        reasons: z.array(z.string().max(500)).max(10).optional(),
        time: z.string().max(100).optional(),
      })
      .nullable()
      .optional(),
    stream: z.boolean().optional(),
    challengeContext: z
      .object({
        itemName: z.string().min(1).max(200),
        amount: z.number().finite().min(0).max(1_000_000),
        challengeId: z.string().max(200).optional(),
      })
      .nullable()
      .optional(),
    locale: z.enum(['en', 'zh']).optional(),
    // 🌱 绿色守护开关: 客户端设置页 Toggle (localStorage 持久化, 零 DDL) 透传上来,
    //    优先级高于 profiles.green_pref 字段探测 (列当前不存在, 见 getSymyGreenContext)
    greenPref: z.enum(['on', 'off']).optional(),
    // 🛡️ batch48-a 守护强度三档: 客户端设置页 (localStorage 持久化, 零 DDL) 透传上来,
    //    letta-turn-context 注入档位指令行 (balanced 缺省 = 不注入, 现状行为)
    guardIntensity: z.enum(['gentle', 'balanced', 'strict']).optional(),
    // 🗺️ batch53-b 守护范围三态: 客户端设置页 (localStorage 持久化, 零 DDL) 透传上来,
    // letta-turn-context 注入 scope 指令行 + green-alt 预检按豁免品类静默卡片。
    // 零信任: 只收形状, 未知品类键被 strip, 非法模式值逐键丢给 normalize 降级 guard。
    guardScope: z
      .record(z.enum(['electronics', 'clothing', 'beauty', 'home', 'food']), z.enum(['guard', 'exempt', 'strict']))
      .optional(),
    // 🐘 batch46-b 微挑战频控: 客户端 localStorage 维护的「最近已发起微挑战」记录
    //    (category + initiatedAt), 服务端 detector 据此做同品类 7 天冷却。零信任: 只收形状。
    microChallengeHistory: z
      .array(
        z.object({
          category: z.enum(['electronics', 'clothing', 'beauty', 'home', 'food']),
          initiatedAt: z.number().finite(),
        }),
      )
      .max(20)
      .optional(),
    // 🐘 batch48-b 反驳降温: 客户端判定上一轮 assistant 消息带过守护卡
    // (greenAlt/reuseHint/microChallenge 任一) 时为 true — 服务端据此才启用
    // pushback 预检 (普通咨询轮不误触发)
    afterGuardCard: z.boolean().optional(),
    // 🐘 batch59-c 追问跟随: 客户端会话态 (内存级) 里最近一条数据问答卡的
    // 窗口/维度元数据 — 服务端 follow-up 检测命中时据此重算 ("那上个月呢")。
    // 零信任: 只收形状, 非法维度值整包 strip (回落普通检测链)
    dataQueryContext: z
      .union([
        z.object({
          kind: z.enum(['savings', 'category', 'impulse']),
          window: z.enum(['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth']),
          category: z.enum(['electronics', 'clothing', 'beauty', 'home', 'food']).optional(),
          impulseWindow: z.enum(['dawn', 'daytime', 'evening', 'lateNight']).optional(),
        }),
        // 🐘 batch62-c 预报卡上文 — 只作 "那周六呢" 单日追问的资格标记。
        // 零信任: 只收形状 (预报无窗口/维度可继承)
        z.object({ kind: z.literal('forecast') }),
      ])
      .nullable()
      .optional(),
    // 🐘 batch61-b 弱信号会话纠正: 客户端 sessionStorage 维护的「用户已纠正的
    // 弱信号词条 id」— 服务端弱信号 detector 据此排除, 一次纠正本会话不再
    // 重复同信号。零信任: 只收形状, 超限整包丢弃 (detector 全量词表 ≪ 50)。
    dismissedContextSignals: z.array(z.string().max(100)).max(50).optional(),
    askedShoppingSubjects: z.array(z.string().max(100)).max(20).optional(),
    // 🌱 batch68-a 绿色采纳后复盘: 客户端 sessionStorage 会话态一次性上行 —
    //    pending = 采纳后待追问 (读后即清, 仅下一轮生效); answer = 追问后的回答
    //    (optionId = 卡片选项点击; 缺省 = 自由文本, 由服务端让位 gate 判定)。
    //    零信任: 只收形状, entryId 服务端再校验词条合法性。
    greenAltRetroPending: z
      .object({ entryId: z.string().min(1).max(100) })
      .optional(),
    greenAltRetroAnswer: z
      .object({
        entryId: z.string().min(1).max(100),
        optionId: z.enum(['already_have', 'rent_borrow', 'try_once', 'reduce_idle']).optional(),
      })
      .optional(),
  })
  .passthrough(); // 允许有未识别字段 (向前兼容)

type ChatRequestBody = z.infer<typeof chatSchema>;

function normalizeChatBody(body: ChatRequestBody) {
  const { messages: rawMessages, impulseContext: rawImpulseContext, stream, challengeContext: rawChallengeContext, locale: rawLocale, greenPref, guardIntensity, guardScope, microChallengeHistory, afterGuardCard, dataQueryContext, dismissedContextSignals, askedShoppingSubjects, greenAltRetroPending, greenAltRetroAnswer } = body;

  // 🔧 Brief C P0 (C1c) fix: normalize locale — default to 'en' for the US market.
  //    旧代码: locale 可能为 undefined/null/空字符串 → 下游虽用 `locale || 'en'` 但分散在多处,
  //    且 Letta agent 可能因记忆了历史中文对话而用中文回复英文 UI 用户。
  //    根因修复: 在入口处统一归一化为 'en' | 'zh', 下游不再需要 fallback。
  const locale: 'en' | 'zh' = rawLocale === 'zh' ? 'zh' : 'en';

  // 🔧 Mirror-mode fix: normalize null → undefined for downstream functions that expect `T | undefined`.
  //    zod .nullable().optional() accepts null from client, but legacy function signatures use `T | undefined`.
  const impulseContext = rawImpulseContext ?? undefined;
  const challengeContext = rawChallengeContext ?? undefined;

  // safeMessages: zod 已保证 role/content 合法, 但 filter 保留作 defense in depth
  const safeMessages = rawMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return { safeMessages, impulseContext, challengeContext, locale, stream, greenPref, guardIntensity, guardScope, microChallengeHistory, afterGuardCard, dataQueryContext: dataQueryContext ?? undefined, dismissedContextSignals, askedShoppingSubjects: askedShoppingSubjects ?? [], greenAltRetroPending: greenAltRetroPending ?? undefined, greenAltRetroAnswer: greenAltRetroAnswer ?? undefined };
}

export type NormalizedChatRequest = ReturnType<typeof normalizeChatBody>;

export type ChatRequestValidation =
  | { ok: false; response: Response }
  | { ok: true; parsed: NormalizedChatRequest };

export async function validateChatRequest(req: NextRequest): Promise<ChatRequestValidation> {
  // BUG-173 fix: 验证 Content-Type 为 application/json
  const contentType = req.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return { ok: false, response: Response.json({ error: 'Content-Type must be application/json' }, { status: 400 }) };
  }

  // 🔧 L6 fix: 请求体大小检查 (防巨大 payload 耗尽 serverless 内存)
  const contentLength = req.headers.get('Content-Length');
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return { ok: false, response: Response.json({ error: 'Request body too large (max 1MB)' }, { status: 413 }) };
  }
  let body;
  try {
    body = chatSchema.parse(await req.json());
  } catch (parseErr) {
    // 🔧 BUG-109 fix: 捕获无效 JSON 请求，返回 400 而非让异常冒泡
    if (parseErr instanceof SyntaxError) {
      return { ok: false, response: Response.json({ error: 'Invalid JSON in request body' }, { status: 400 }) };
    }
    // zod error
    const issues =
      parseErr instanceof z.ZodError
        ? parseErr.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          }))
        : [{ message: 'Validation failed' }];
    return { ok: false, response: Response.json({ error: 'Validation failed', issues }, { status: 400 }) };
  }

  return { ok: true, parsed: normalizeChatBody(body) };
}
