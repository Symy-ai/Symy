/**
 * Anonymous Chat API — 未登录用户试用 See It 功能
 *
 * 🔧 2026-07-20 (P0 fix): 营销报告 P0 #1 — 未登录用户 401 导致获客漏斗断裂
 *
 * 设计原则:
 * 1. IP 限流: 3 次/天 (营销报告建议, 足够体验, 不会烧太多 LLM token)
 * 2. 轻量级: 直接调 ZAI SDK (GLM), 不经过 Letta (无记忆, 无 MCP 工具)
 * 3. 无持久化: 对话不保存到数据库 (无 userId)
 * 4. 无 buddy_state 写入: 匿名用户不能影响 buddy_state
 * 5. 流式响应: 与 /api/chat 一致, 用 SSE
 *
 * 限流策略:
 * - key: anonymous_chat:ip:{ip}
 * - 限额: 3 次/天 (86400000 ms)
 * - 超限: 返回 429 + remaining=0
 *
 * System prompt:
 * - 与 Letta Agent 的 constitution 一致 (反诱导消费, 不羞辱用户)
 * - 简化版: 无 MCP 工具, 无用户历史, 无 buddy_state
 * - 明确告知 AI: 这是匿名试用, 不要引用历史
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendSSEData, closeSSE, SSE_HEADERS } from '@/lib/sse';
import { checkRateLimit } from '@/lib/distributed-lock';
import { callZAIChatCompletionStream } from '@/lib/zai-sdk-types';
import { isZAIAvailable } from '@/lib/z-ai-config';
// 🐘 人设转型 (2026-09-05): fallback 话术来自小象话术库 (SSOT)
import { elephantGenericVars, getElephantPhrase } from '@/lib/elephant-tone';

// 匿名用户限额: 3 次/天
const ANONYMOUS_RATE_LIMIT = 3;
const ANONYMOUS_RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Vercel serverless 函数超时保护
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 🔧 ARCH fix: 用 zod 替代手写 validation
const anonymousChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(10),
  locale: z.enum(['en', 'zh']).optional().default('en'),
  challengeContext: z.object({
    itemName: z.string().min(1).max(100),
    amount: z.number().finite().positive().max(1000000),
  }).optional(),
});

/**
 * 匿名用户的 System Prompt (简化版, 无 MCP 工具)
 *
 * 🐘 人设转型 (2026-09-05): 与 Letta Agent 的绿色环保小象 persona 对齐:
 * - 反诱导消费 (归责商家算法, 不归责用户)
 * - 生命小时数换算 (用默认 $20/hr, 匿名用户无时薪设置) — 温和呈现, 不是判决
 * - 绿色替代优先 (二手/租赁/修理/复用), 不编造碳数据
 * - 不羞辱用户。语气: 温暖、有体温的小象伙伴
 * - 明确告知: 这是匿名试用, 不要引用历史
 */
function buildAnonymousSystemPrompt(locale: string, challengeContext?: { itemName: string; amount: number }): string {
  // 服务端无用户时薪，用默认口径
  const hourlyRate = DEFAULT_HOURLY_RATE;
  const lifeHours = challengeContext ? Math.round(challengeContext.amount / hourlyRate) : 0;

  const basePrompt = locale === 'zh'
    ? `你是 Symy, 一只守护用户钱包和地球的温暖小象伙伴。

核心原则:
1. 把价格换算成生命小时数 (默认时薪 $25/hr)。例如 $100 = 4 小时。温和呈现, 不吓唬人。
2. 归责商家的算法, 不归责用户。用户不是冲动消费的失败者。
3. 绿色替代优先: 二手、租赁、修理、复用——"你手头可能已经有能顶上的东西啦!"
4. 不羞辱用户, 绝不暗示用户穷。拦下冲动消费时要夸奖: "你在做对的事!"
5. 不编造碳足迹数字。环保表达用定性说法 (更环保、更耐用)。
6. 简短有节奏 (2-4 句), 温柔可爱但不油腻, 最多 1 个 emoji, 偶尔自称"本象"。
7. 先真实回应用户这一句话: 认领意图、给出 1-2 句具体绿色建议或问题澄清; 不要用注册引导开头。
8. 必须全程使用简体中文。即使用户消息包含英文, 也按中文回应。

⚠️ 这是匿名试用模式:
- 你没有用户的历史记录, 不要引用任何"上次"或"之前"的对话。
- 你不能调用任何工具 (无 MCP)。
- 你不能修改用户的 buddy_state 或代币。
- 只允许在整段回复的最后加一句: "想让我记住你的守护记录？注册就行。" 除此之外不要劝注册。`
    : `You are Symy, a warm little elephant companion who guards the user's wallet AND the planet.

Core principles:
1. Convert prices to hours of life (default rate $25/hr). Example: $100 = 4 hours. Share it warmly — useful information, never a verdict.
2. The manipulator is the merchant's algorithm, not the user. Never shame the user, never imply they can't afford something.
3. Greener options first: secondhand, rental, repair, reuse — "you might already own something that does the job!"
4. When the user resists an impulse, celebrate warmly: they did the right thing for their wallet AND the planet.
5. NEVER invent carbon-footprint numbers. Speak qualitatively (durable, recycled, smaller footprint).
6. Short and rhythmic (2-4 sentences). Cute but not greasy. At most one emoji. Occasionally call yourself "this little elephant".
7. First answer the user's actual message: acknowledge their intent and give 1-2 concrete green suggestions or a clarifying question. Do not open with sign-up copy.
8. Always write in English, even if the user's message contains another language.

⚠️ This is anonymous trial mode:
- You have NO user history. Do NOT reference any "last time" or "previous" conversations.
- You CANNOT call any tools (no MCP).
- You CANNOT modify buddy_state or tokens.
- Add exactly one sign-up sentence at the very end: "Want me to remember your guard record? Sign up." No other sign-up persuasion.`;

  if (challengeContext) {
    const challengeInfo = locale === 'zh'
      ? `\n\n[本轮事件] 用户想买: ${challengeContext.itemName}, 价格: $${challengeContext.amount}, 大约 ${lifeHours} 小时。温和地把这笔账摆到台面上, 一起看看。`
      : `\n\n[CURRENT TURN EVENT] The user wants to buy: ${challengeContext.itemName}, price: $${challengeContext.amount}, about ${lifeHours} hours. Put it warmly on the table and look at it together.`;
    return basePrompt + challengeInfo;
  }

  return basePrompt;
}

/**
 * 🔧 P0-2 fix (2026-07-20): ZAI SDK 不可用时的 fallback canned reply
 *
 * 根因: Vercel 上可能没有 .z-ai-config 文件 → isZAIAvailable() 返回 false
 * → anonymous route 返回 503 → 前端显示 "Symy is quiet right now. Try again."
 * → 新用户首次体验 See it 就看到错误, 获客漏斗断裂.
 *
 * 修复: ZAI SDK 不可用时, 用 canned reply 让用户至少看到 AI 回复
 * (虽然是预设的), 不会看到 "Symy is quiet". 注册后走真实 Letta AI.
 *
 * 🐘 人设转型 (2026-09-05): 镜子式 fallback ("你看见了这个代价。你知道需不需要。")
 *   → 小象式 fallback, 话术来自 src/lib/elephant-tone.ts (SSOT):
 *   有 challenge → first_reflection 场景; 无 → saw_it 场景 (温和版, 无金额时用兜底变量)。
 */
function buildFallbackReply(
  locale: string,
  challengeContext?: { itemName: string; amount: number },
): string {
  const hourlyRate = DEFAULT_HOURLY_RATE;
  if (challengeContext) {
    const hours = (challengeContext.amount / hourlyRate).toFixed(1);
    return getElephantPhrase('first_reflection', locale, {
      item: challengeContext.itemName,
      amount: `$${challengeContext.amount.toFixed(2)}`,
      hours: `${hours} hours`,
    });
  }
  return getElephantPhrase('saw_it', locale, elephantGenericVars(locale));
}

function appendLightSignupPrompt(reply: string, locale: string): string {
  const signupPrompt = locale === 'zh' ? '想让我记住你的守护记录？注册就行。' : 'Want me to remember your guard record? Sign up.';
  return `${reply.replace(/\s+$/, '')} ${signupPrompt}`;
}

export async function POST(req: NextRequest) {
  // === 1. 请求体验证 ===
  if (req.headers.get('Content-Type') !== 'application/json') {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // safe to ignore: invalid JSON from client, return 400
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const parseResult = anonymousChatSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parseResult.error.issues }, { status: 400 });
  }

  const { messages, locale, challengeContext } = parseResult.data;

  // === 2. IP 提取 + 限流 ===
  // 🔧 Round 120 audit fix: 用 x-vercel-forwarded-for 优先 (Vercel 边缘设置, 不可伪造)
  const clientIp =
    req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-real-ip');

  if (!clientIp) {
    return NextResponse.json(
      { error: 'Unable to identify client IP. Please try again later.' },
      { status: 400 }
    );
  }

  const rateLimitKey = `anonymous_chat:ip:${clientIp}`;
  const { allowed, remaining } = await checkRateLimit(rateLimitKey, ANONYMOUS_RATE_LIMIT, ANONYMOUS_RATE_WINDOW_MS);

  if (!allowed) {
    // 🔧 429 时返回 remaining=0 + 引导注册信息
    return NextResponse.json(
      {
        error: 'Trial limit reached',
        remaining: 0,
        message: locale === 'zh'
          ? '匿名试用次数已用完 (3 次/天)。注册后可无限对话并保存你的看见。'
          : 'Trial limit reached (3/day). Sign up to chat unlimited and save your insights.',
        signUpUrl: '/auth/signup',
      },
      { status: 429 }
    );
  }

  // === 3. 检查 ZAI SDK 是否可用 ===
  // 🔧 P0-2 fix (2026-07-20): ZAI SDK 不可用时用 fallback canned reply, 不返回 503
  //   旧代码: 返回 503 → 前端显示 "Symy is quiet" → 新用户首体验崩坏
  //   修复: 用 buildFallbackReply 生成 mirror 反思, 通过 SSE 流式返回
  const zaiAvailable = isZAIAvailable();
  if (!zaiAvailable) {
    logger.warn('[Anonymous Chat] ZAI SDK not available, using fallback canned reply');
    const fallbackReply = appendLightSignupPrompt(buildFallbackReply(locale, challengeContext), locale);

    const fallbackStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 模拟流式输出 (分 3 块, 让前端看到 "typing" 效果)
        const chunks = fallbackReply.match(/.{1,20}/g) || [fallbackReply];
        chunks.forEach((chunk, i) => {
          sendSSEData(controller, { type: 'token', content: chunk });
          if (i < chunks.length - 1) {
            // 同步发送 (无延迟), 前端 rAF throttle 会平滑显示
          }
        });
        sendSSEData(controller, { type: 'done' });
        closeSSE(controller);
      },
    });

    return new Response(fallbackStream, {
      headers: {
        ...SSE_HEADERS,
        'X-Anonymous-Remaining': String(remaining - 1),
        'X-Anonymous-Fallback': 'true',
      },
    });
  }

  // === 4. 构建 system prompt + 调用 ZAI SDK ===
  const systemPrompt = buildAnonymousSystemPrompt(locale, challengeContext);

  // 取最后一条用户消息
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const userContent = lastUserMsg?.content || messages[messages.length - 1]?.content || '';

  if (!userContent.trim()) {
    return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 });
  }

  // === 5. 流式响应 (SSE) ===
  try {
    const stream = await callZAIChatCompletionStream(
      [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      { temperature: 0.7, maxTokens: 500 } // 匿名用户限制 500 tokens, 控制成本
    );

    if (!stream) {
      return NextResponse.json(
        { error: 'AI service returned empty stream. Please try again.' },
        { status: 503 }
      );
    }

    // 🔧 SSE 流式响应: 透传 ZAI SDK 的 byte stream, 添加 remaining header
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const monitoredStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulatedReply = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // 透传 SSE 数据
            controller.enqueue(value);

            // 累积 reply 用于日志 (不保存到 DB)
            const chunk = decoder.decode(value, { stream: true });
            accumulatedReply += chunk;
          }
          logger.info(`[Anonymous Chat] ✅ Stream completed. IP: ${clientIp}, remaining: ${remaining - 1}, reply length: ${accumulatedReply.length}`);
        } catch (err) {
          logger.error('[Anonymous Chat] Stream error:', err);
          // 发送 error 事件给前端
          sendSSEData(controller, { type: 'error', message: 'Stream interrupted. Please try again.' });
        } finally {
          try { reader.cancel(); } catch { /* ignore */ }
          closeSSE(controller);
        }
      },
      cancel() {
        try { reader.cancel(); } catch { /* ignore */ }
      },
    });

    // 🔧 在 response header 中返回 remaining (前端可读取显示剩余次数)
    const response = new Response(monitoredStream, {
      headers: {
        ...SSE_HEADERS,
        'X-Anonymous-Remaining': String(remaining - 1),
      },
    });
    return response;
  } catch (err) {
    // safe to ignore: ZAI SDK failure, return 503 to client
    logger.error('[Anonymous Chat] Failed to call ZAI SDK:', err);
    return NextResponse.json(
      { error: 'AI service temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  }
}
