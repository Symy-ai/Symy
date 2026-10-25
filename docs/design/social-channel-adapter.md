# Symy 社交渠道接入层架构设计（social-channel-adapter）

- **状态**：PLAN-ONLY 设计稿（2026-10-25）。本文档不伴随任何代码改动。
- **作者**：coordinator（基于 night-main@342984ec 仓库实勘）。
- **产品背景**："无UI"模式——用户在社交软件里把 Symy 当一个聊天对象，零新 App、零习惯改变。参考实现 = Telegram Bot；接口必须平台无关、可扩展微信生态。
- **实施路径**：本文档 §13 任务清单 → developer 施工 → arch 审 → QA 站真浏览器/真 HTTP 验收。

---

## 0. 目标与非目标

**目标（MVP）**
1. Telegram 文本消息进出：用户在 TG 里私聊 bot → Symy 单条终稿回复。
2. 身份绑定：platform identity ↔ Supabase user，含免登录影子账号冷启动。
3. 限额：与 Web 端共享同一份每用户配额语义。
4. 防滥用：签名验证、重放丢弃、洪水防护、同用户串行化、全局预算熔断。

**非目标（MVP 明确不做）**
- 流式分片回复（见 §7 决策：单条终稿）。
- 图片/语音输入、推荐卡片、hands 购物车集成、微信适配器 → 全部 P2（§12）。
- 群聊（MVP 只处理 `chat.type === 'private'`，其余静默 200 丢弃）。

**复用清单（不许重造）**
| 现有资产 | 位置 | 渠道层用法 |
|---|---|---|
| chat 相位拆分 parts | `src/app/api/chat/parts/` | 直接 import `loadLettaTurnContext` / `processLettaResponse` 等 |
| 限流/锁 | `src/lib/distributed-lock.ts` | `checkRateLimit` / `acquireLock`，沿用 `chat:daily:${userId}` 同键 |
| 文本通道分离 | `src/lib/agent-stream.ts` | `visibleMessage` / `stripLeakedReasoning` 保 reasoning 不入消息体 |
| per-user agent | `src/lib/letta-agent-manager.ts` | `getUserAgentId` / `getOrCreateAgentId` |
| admin client | `src/lib/supabase-admin.ts` | webhook 侧服务端读写（绕 RLS） |
| 审计/观测 | `admin-audit.ts` `logAIBehavior` `logger` Sentry | 事件沿用分级约定 |
| env 注册表 | `src/lib/env-consumers.ts` | 渠道 env 显式失败声明 |
| 迁移纪律 | `supabase/migrations/`（已到 152） | 新迁移从 **153** 起，入 `PENDING-OWNER-DEPLOY.md` |

---

## 1. 总体架构

```
Telegram 云 ──POST──▶ /api/channels/[platform]/webhook        (Vercel, nodejs)
                          │
                          │ ① adapter.verify()   secret_token 常时比较 / 微信 sha1+echostr
                          │ ② 快路径(同步, <100ms): 未知平台404 / 签名失败401 /
                          │    update_id 去重 / 洪水限流 / 同用户回合锁
                          │ ③ 立即 200 ack   ←←← 铁律: 签名通过后无论如何都 200
                          │ ④ waitUntil( 后台回合 )        maxDuration=60
                          ▼
                ┌─ channel-chat 核心（渠道无关, src/lib/channel-chat/）
                │   identity: channel_bindings → (影子) Supabase user
                │   quota:   checkRateLimit(`chat:daily:${userId}` …) 与 Web 同键
                │   turn:    loadLettaTurnContext + processLettaResponse（复用 chat parts）
                └──────────────────┬──────────────────────────
                                   ▼
                     Letta(记忆) + GLM-5.2 + hands/MCP 工具
                                   │ ⑤ 单条终稿 → adapter.sendMessage 分片+转义
                                   ▼
                     api.telegram.org/bot<token>/sendMessage → 用户聊天窗
```

分层原则：
- **webhook 路由**只做：验签 → 快路径闸门 → ack → 派发后台任务。不含业务逻辑。
- **channel-chat 核心**（`src/lib/channel-chat/`）渠道无关：输入 `{userId, locale, text}`，输出 `{outcome, replyText}`。不 import 任何平台 SDK/URL。
- **平台适配器**（`src/lib/channels/<platform>/`）承载 100% 的平台知识：验签、payload 解析、发送、格式转义、平台限制。

---

## 2. Webhook 入口路由形态与签名验证

### 2.1 决策：`/api/channels/[platform]/webhook` 动态段 + 适配器注册表

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 动态段 `[platform]` + 注册表（选定）** | 平台身份由 URL 决定，无需 body 嗅探；验签策略按平台分派干净；日志/监控按 path 过滤；单一路由文件零重复 | 动态段需自行校验 platform 合法性（注册表已覆盖，未注册 → 404） |
| B. 单一 `/api/webhook` 多路复用 | path 少一个 | 必须先解析 body 才知道是谁的 payload（Telegram update 无平台标记）；微信 GET echostr 与 Telegram POST 混在 一个 handler 里分叉爆炸；外部设置 webhook URL 时语义含糊 |

B 的"body 嗅探定平台"在微信加密报文下根本不可行（密文无特征），一票否决。

路由文件：`src/app/api/channels/[platform]/webhook/route.ts`
- `export const dynamic = 'force-dynamic'; export const runtime = 'nodejs'; export const maxDuration = 60;`
- `GET`：telegram → 405（Telegram 从不 GET）；`wechat_mp`（P2）→ echostr 校验流。
- `POST`：主流程（§2.3）。
- **proxy.ts 无需改动**：`/api/*` 已在 `isNonLocalizedRoute` 白名单内绕过 next-intl（src/proxy.ts:20），`/{locale}/api/*` 308 规则也兜住了。P2 可选微优化：webhook path 提前 return 跳过 Supabase session refresh（省一次 getUser 往返，非必需）。

### 2.2 签名验证（每平台一策）

| 平台 | 机制 | 细节 |
|---|---|---|
| Telegram | `setWebhook` 时设 `secret_token`，之后每个 update 带 `X-Telegram-Bot-Api-Secret-Token` 头 | 用 `crypto.timingSafeEqual` 常时比较（先比长度再比内容，不等长直接失败）；缺失/不匹配 → **401** + `logger.warn('[Channel] sig_fail')`。IP 白名单（149.154.160.0/20、91.108.4.0/22）为可选纵深防御，env 开关默认关 |
| 微信 MP（P2） | URL 接入：GET `signature = sha1(sort(token, timestamp, nonce))`，验证通过原样返回 `echostr`；消息推送：加密模式下 `msg_signature`（AES, EncodingAESKey） | 适配器接口的 `verify()` 返回 `echoResponse` 字段承载"验签即响应"语义（见 §3） |
| 企业微信（P2） | 同 echostr 模式（需解密后回显） | 同上 |

### 2.3 POST 快路径（伪码序）

```
platform = params.platform
adapter  = registry.get(platform)          // null → 404
if (!channelsEnabled(platform)) → 503      // CHANNELS_ENABLED 门, 默认关
rawBody  = await req.text()                // 原文必须留给 sha1/AES 验签
if (!adapter.verify(req, rawBody).ok) → 401
messages = adapter.parse(req, rawBody)     // zod: 外部报文 loose 容忍未知字段
if (messages.length === 0) → 200           // edited_message/channel_post 等静默丢
msg = messages[0]                          // Telegram 单 update 单消息
if (!acquireLock(`channel:upd:${platform}:${msg.dedupId}`, 24h)) → 200   // 重放丢弃
if (!checkRateLimit(`channel:flood:${platform}:${msg.platformUserId}`, 20, 60_000).allowed)
    → 尽力发"发太快了"提示, → 200
if (!acquireLock(`channel:turn:${platform}:${msg.platformUserId}`, 90_000, failClosed=true))
    → 发"上一条还在回答中", → 200
waitUntil(processTurn(adapter, msg))       // 锁在 processTurn finally 里释放
return 200                                 // < 1s ack
```

**铁律：签名通过之后，无论内部发生什么（LLM 炸、DB 炸、发送失败）都返回 200。** 否则 Telegram 会以退避节奏重试数小时，造成重复回复。错误一律在带内（错误提示消息）+ 日志/Sentry 处理。

**zod 策略**：仓库纪律 `.strict()` 用于"我们自己定义的入参契约"；平台外部报文是别人的契约，用 `z.object({...消费的字段强类型...}).loose()`（未知字段容忍，Telegram 加字段不炸），解析失败 → 200 + `debug` 日志静默丢（不是我们的用户输入，不回错误提示）。

---

## 3. 渠道无关核心 + 平台适配器接口

```ts
// src/lib/channels/types.ts（设计稿, 实施时以此为准）
export type PlatformId = 'telegram' | 'wechat_mp' | 'wechat_wecom';

export interface VerifyResult {
  ok: boolean;
  /** 微信 GET echostr 验证: 验过即需原样回显 */
  echoResponse?: string;
  reason?: 'bad_signature' | 'missing_header';
}

export interface InboundMessage {
  platform: PlatformId;
  platformUserId: string;      // TG from.id / 微信 openid
  chatRef: string;             // 回复目标: TG chat_id / 微信 openid
  text: string;                // MVP 仅文本
  dedupId: string;             // TG update_id / 微信 MsgId — 重放去重键
  languageHint?: string;       // TG from.language_code ('zh-CN' → locale)
  kind: 'text' | 'command_start' | 'unsupported';
}

export interface ChannelAdapter {
  platform: PlatformId;
  capabilities: { asyncPush: boolean };  // 能否"事后主动推送" — 见 §5 微信约束
  verify(req: NextRequest, rawBody: string): Promise<VerifyResult>;
  parse(req: NextRequest, rawBody: string): Promise<InboundMessage[]>;
  /** 异步回复: 单条终稿文本; 分片/转义/429 重试都在实现内 */
  sendMessage(chatRef: string, text: string, opts?: { locale?: 'zh' | 'en' }): Promise<{ ok: boolean; error?: string }>;
  /** 回合期间"正在输入"指示, best-effort */
  sendTyping?(chatRef: string): Promise<void>;
}
```

注册表 `src/lib/channels/registry.ts`：静态 map，`getAdapter(platform: string)` 未知返回 null。**注册时校验 `capabilities.asyncPush === false` 的平台直接拒绝注册**（把 §5 微信约束做成结构性防呆：个人订阅号适配器根本挂不上注册表）。

回合核心契约：

```ts
// src/lib/channel-chat/run-channel-turn.ts
export interface ChannelTurnResult {
  outcome: 'replied' | 'limit_daily' | 'limit_hourly' | 'agent_unavailable' | 'unsupported' | 'error';
  replyText?: string;   // 已本地化的、可直接发送的纯文本（无平台标记）
}
```

---

## 4. 身份绑定：channel_bindings

### 4.1 表设计（迁移 153）

```sql
-- supabase/migrations/153_channel_bindings.sql
CREATE TABLE IF NOT EXISTS public.channel_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'wechat_mp', 'wechat_wecom')),
  platform_user_id TEXT NOT NULL,          -- TG from.id / 微信 openid（唯一身份键）
  platform_username TEXT,                  -- TG @username, 仅展示用, 永不回显渲染
  chat_ref TEXT NOT NULL,                  -- 回复目标
  locale TEXT NOT NULL DEFAULT 'zh' CHECK (locale IN ('zh', 'en')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_user_id)      -- 一个平台身份只绑一个 user
);

CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON public.channel_bindings (user_id);

ALTER TABLE public.channel_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_bindings_select_own" ON public.channel_bindings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "channel_bindings_insert_own" ON public.channel_bindings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "channel_bindings_update_own" ON public.channel_bindings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- MVP 不发 DELETE policy（解绑走服务端 admin 路径, 用户端无删除入口）

GRANT SELECT, INSERT, UPDATE ON public.channel_bindings TO authenticated;
```

- RLS 纪律达标：UPDATE 双句（USING + WITH CHECK），**148 号迁移的 DO 守卫（任何 UPDATE policy 缺 WITH CHECK 即部署失败）对本表天然通过**。
- 服务端读写走 `createAdminClient()`（service role 绕 RLS）；RLS 只服务 P2 的"网页端绑定管理页"。
- 迁移登记进 `PENDING-OWNER-DEPLOY.md`（涉 DB 部署留 owner 批）。

### 4.2 绑定流程两方案

**方案 A：深链 start 参数一次性码绑定既有账号**
- 流程：网页登录 → 绑定页生成 5 分钟一次性码 → 用户点 `t.me/<bot>?start=CODE` → `/start CODE` → webhook 校验码 → `channel_bindings` 绑到既有 user_id。
- 优点：单一身份、premium/记忆/历史全连续；auth.users 无杂质账号。
- 缺点：**冷启动必须先上网页登录**——对"零 App、零习惯改变"的产品定位是漏斗杀手；TG 用户往返网页的流失率极高。

**方案 B：免登录影子账号（推荐，MVP 默认）**
- 流程：首条消息（`/start` 或任意文本）→ 查 `channel_bindings` 未命中 → `auth.admin.createUser({ email: 'tg-<platform_user_id>@channels.symy.internal', email_confirm: true, user_metadata: { channel: 'telegram', platform_user_id } })`（确定性邮箱 = 天然幂等）→ 插 binding → `getOrCreateAgentId(userId)` 预建 agent → 发欢迎语。
- 优点：零摩擦，聊天即用，完全贴合"把 Symy 当聊天对象"的定位；配额/锁/审计挂在真实 user_id 上，与 Web 同构。
- 缺点与对策：
  - `auth.users` 出现不可登录的占位账号（`channels.symy.internal` 不可投递域，`email_confirm: true` 免邮件回路）——可接受，且 **P2 方案 A 作为升级路径**：影子用户日后在网页用邮箱注册/登录后，凭一次性码把 binding 迁到真人账号（合并记忆由 Letta agent 迁移完成，一次性操作）。
  - Supabase MAU 计费口径：影子账号计入月活。**成本量级 = 渠道真实月活，与业务收入同向，可接受**；此点在 owner 部署批迁移时一并提示。

**推荐：B 为 MVP 唯一路径，A 降级为 P2 的"账号合并升级"功能。** 两者共用同一张 channel_bindings 表，不互斥。

### 4.3 locale 判定

`InboundMessage.languageHint`（TG `from.language_code`）→ `zh*` 映射 `zh`，其余 `en`；落库到 binding.locale，之后复用。默认 `zh`。

---

## 5. 延迟模型与平台硬约束（必须写死的认知）

### 5.1 通用异步模式（选定）

webhook 必须（准）立即 200；LLM 回合 3-30s（Letta + GLM-5.2 非流式典型 5-15s，见 route.ts:236-239 注释）。因此：

1. 快路径 ack（§2.3，目标 <1s）。
2. 回合跑在 `waitUntil(processTurn(...))`（`@vercel/functions`，仓库已在 stream-audit/admin-audit 用同款），路由 `maxDuration = 60` 覆盖回合时长。
3. 回合完成后 `adapter.sendMessage` 主动推送终稿；期间 `sendTyping`（TG `sendChatAction`）best-effort 指示"正在输入"。
4. 锁/审计/日志全部在 `processTurn` 的 `try/finally` 内闭环。

**为什么不另起队列**：waitUntil + maxDuration=60 已覆盖 3-30s 回合；引入 QStash/自建 outbox 表+cron 扫是 MVP 过度设计（YAGNI）。**兜底路径写明**：若 waitUntil 被平台 kill（罕见，Vercel 流体计算下有 maxDuration 硬顶），现象 = 用户没收到回复且 `turn_error` 日志在；P2 可加 `channel_outbox` 表 + cron 扫描补偿。MVP 以 `logger.error`（自动进 Sentry）暴露此风险，接受率靠观测确认。

**备选（已评估弃用）**：webhook 内自调内部 `/api/channels/[platform]/turn` 端点（服务间鉴权用 CRON_SECRET 式共享密钥）。优点是 webhook 与回合的时长预算解耦；缺点是新增一个高权限内部端点攻击面 + 双跳延迟。若 P2 回合时长超 60s 再启用，接口位置已预留。

### 5.2 平台限制（写进设计的硬事实）

**Telegram**
- 每消息上限 **4096 字符**；非官方广播限制 ~30 msg/s 全局、~1 msg/s 单聊突发，超限 429 带 `retry_after` → client 实现按 `retry_after` 退避重试。
- webhook 非 2xx / 超时会退避重试数小时 → §2.3 铁律（签名通过后恒 200）。
- `secret_token` 机制见 §2.2。

**微信（硬约束，P2 选型依据）**
- **个人订阅号：没有客服消息接口，只有"被动回复"，且被动回复有 5 秒硬超时**（5s 内未回 XML 即显示"该公众号暂时无法提供服务"，用户重试仅 3 次）。LLM 链路 3-30s 在此模型下**不可行，无任何工程手段绕过**。
- **结论：微信侧必须用（已认证）服务号的客服消息接口或企业微信**——用户发消息后 48 小时窗口内可异步主动推送，与 §5.1 异步模型天然匹配。个人订阅号方案在本设计中被 `capabilities.asyncPush` 结构性禁止（§3），不允许任何人写出"5s 内硬等 LLM"的错误实现。
- 微信加密模式（EncodingAESKey + msg_signature）与 echostr 接入验签全部封在 wechat_mp 适配器内。

---

## 6. chat 管线复用方式

### 6.1 两方案对比

| 维度 | 方案一：抽内部服务函数，webhook 侧直接 import（选定） | 方案二：webhook 侧服务间 HTTP 自调 /api/chat |
|---|---|---|
| 改动面 | chat parts 已是模块化导出（26 刀拆相位完成），只需新增 `src/lib/channel-chat/` 编排层 + `daily-limit-guard` 导出键名 helper（纯增量） | /api/chat 零改动，但要新增内部鉴权通道 |
| 鉴权 | channel 有 userId（来自 binding），直接传参 | /api/chat 是 cookie 鉴权（`createAuthenticatedClient`）；匿名路径被 guest-gate 限 1-2 条 + 按 IP 限流 → **自调必须伪造/铸造 Supabase 会话 cookie 或加服务旁路**——前者脏，后者是新攻击面 |
| 契约 | 直接消费 `loadLettaTurnContext` / `processLettaResponse` 返回值 | 要消费前端形状的 JSON（reply/卡片字段）或 SSE，服务端再解析自己家的 HTTP——荒谬但真实 |
| 延迟/预算 | 单跳；maxDuration 一份 | 双跳；webhook 与 chat 两份 maxDuration 各 60s，预算翻倍 |
| 错误处理 | typed 异常直接 catch | HTTP 状态码 + JSON error 二次翻译 |
| 回归风险 | 编排层是纯新增；唯一触碰点 = daily-limit-guard 加导出（不改正文行为，structure-lock 锚点 `await checkDailyChatLimit(` 保留） | chat route 一行不改，但内部鉴权旁路本身是 chat 安全面变更，回归风险实际更大 |

**决策：方案一。** 方案二的"零改动"是幻觉——它把改动从代码层挪到了安全面。

### 6.2 复用落点（实施蓝图）

`src/lib/channel-chat/run-channel-turn.ts` 编排序（全部复用现有导出）：

1. `getUserAgentId(userId)`（letta-agent-manager）——渠道用户在绑定时已 `getOrCreateAgentId` 预建，此处为查询；null → `agent_unavailable` 文案（复用 §buildAgentUnavailableResponse 的语义但输出纯文本）。
2. 配额（与 Web **同键共享**）：
   - 免费档：`checkRateLimit('chat:daily:' + userId, 50, 24h)` —— 键格式从 `parts/daily-limit-guard.ts` 导出 helper（`chatDailyKey(userId)`），避免字面量双写漂移；premium 判定复用 `getChatProfileSnapshot`。
   - 小时窗：`checkRateLimit('chat:user:' + userId, 30, 1h)`（与 rate-guard 同语义）。
   - **同键 = 同一份配额**：绑定用户在网页和 TG 聊天共享 50 条/天，防双表面套利；影子用户天然独立。
3. `loadLettaTurnContext({ userId, supabase, userContent, locale, factsStore?, ... })`（parts/letta-turn-context）——`supabase` 传 admin client，沿用 route.ts:107-112 的 factsStore 边界收窄先例（`as unknown as` 一次性断言）；`greenPref` 等可选入参传 undefined 走现有默认。
4. `processLettaResponse(userContentWithStage, undefined, userId, targetAgentId, undefined)`（parts/letta-response，非流式路径）→ `reply`。
5. `stripLeakedReasoning(reply)`（agent-stream）兜底防 reasoning 泄漏（非流式路径的 belt-and-suspenders）。
6. 审计：`fireAndForgetSafely(logAIBehavior({ userId, action: 'tool_call', userInput, aiOutput: reply, ... }))` + PostHog `captureLLMGeneration` 同款延迟采集（§10）。

**Web 路线零行为变更**：route.ts 不动；`parts/daily-limit-guard.ts` 仅新增导出（现有 `daily-limit-guard.test.ts` 与 `route-structure-lock.test.ts` 必须保持绿——任务清单里有显式验收项）。

---

## 7. 回复形态与 Markdown 适配

**决策：单条终稿（倾向项确认），不做流式分片。**
- Telegram bot API 没有"追加式流"接口；`editMessageText` 模拟流式 = 每秒 1 次编辑的 hack，撞单聊 1 msg/s 限速、UI 闪烁、失败面大。
- 微信客服消息本身就是整条推送。
- 观感补偿：回合期间 `sendChatAction(typing)`。

**4096 截断分片**（telegram client 实现内）：
- 阈值取 **4000**（留 parse_mode 实体开销余量）；按段落边界 → 换行 → 最后一个空白符顺序切；尾片丢弃纯空白。
- 分片顺序 `for await` 发送，串行 + 尊重 429 `retry_after`。

**转义责任分层（铁律）**：
- **channel-chat 核心输出纯文本**（LLM 原生 markdown），绝不掺平台标记。
- **适配器独占格式化权**：TG client 内做 markdown→Telegram HTML 的有损转换（`**粗体**→<b>`、链接→`<a>`、列表→"· " 前缀、其余标记剥除），并转义 `& < >`；**不选 MarkdownV2**（其转义字符集含 `.!-()` 等常用字符，LLM 输出几乎必炸）。
- **降级链**：HTML 发送若 TG 返回 400（parse 错误）→ 剥全部标记以纯文本重发一次（`parse_mode` 省略）→ 仍败则 `logger.error` 进 Sentry。
- 微信适配器：纯文本（news 卡片是 P2 推荐卡片的事）。

---

## 8. 限流、防滥用与并发串行化

| 层 | 机制 | 键 / 参数 | 行为 |
|---|---|---|---|
| 重放攻击 | `acquireLock` 幂等门 | `channel:upd:${platform}:${dedupId}`，TTL 24h | 已见 → 200 静默丢 + debug 日志。主防线是 §2.2 签名，此为纵深 |
| 洪水（单平台用户） | `checkRateLimit` | `channel:flood:${platform}:${platformUserId}`，20 次/分钟 | 超限 → 200 + 尽力发一条"发太快了"轻提示（提示本身也限频：借同一 key 判定） |
| 每用户回合串行化 | `acquireLock` failClosed | `channel:turn:${platform}:${platformUserId}`，TTL 90s（> maxDuration 60s） | 拿不到锁 = 有在途回合 → 发"上一条还在回答，稍等一下"→ 200。**选"丢弃+轻提示"而非排队**：serverless 无进程内队列，外部队列 YAGNI；TG 用户天然会重发。锁 key 用 platform identity（不是 userId）——首条消息此刻还没有 userId，锁必须在身份解析之前 |
| 每用户日/时限 | 同 Web 同键 | `chat:daily:${userId}` 50/24h；`chat:user:${userId}` 30/1h | §6.2，超限 → 友好文案"今日额度已用完，明天再来 / 升级 Premium" |
| 全局预算熔断 | `checkRateLimit` | `channel:global:daily`，上限 env 可配（默认 2000/24h） | 任何人都可开 TG 号白嫖影子账号 → 全局日预算兜底防 token 失血；触顶 → 全渠道回复"今日服务繁忙" + `logger.warn` |
| 伪造请求 | 签名（§2.2）+ 未知平台 404 + `CHANNELS_ENABLED` 门（默认关，未配 env 时 503） | — | fail-closed |

注：`channel:global:daily` 与 per-user 键都走现有 `distributed_locks` 基础设施（migration 024），无新表。

---

## 9. 密钥与配置（Vercel env，绝不入仓）

| 变量 | 用途 | 层级 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API 调用 + setWebhook | Production + Preview |
| `TELEGRAM_WEBHOOK_SECRET` | setWebhook `secret_token`（随机 32+ 字符 `[A-Za-z0-9_-]`），与 TG 回调头常时比较 | Production + Preview |
| `CHANNELS_ENABLED` | 渠道开关，逗号列表（如 `telegram`）；空/缺省 = 全关 | Production + Preview |
| `CHANNEL_GLOBAL_DAILY_BUDGET` | §8 全局熔断上限，默认 2000 | 可选 |
| `CHANNEL_IP_WHITELIST_ENFORCE` | TG 官方 IP 段白名单强制开关，默认 `false` | 可选（纵深防御） |
| （P2）`WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` / `WECHAT_MP_TOKEN` / `WECHAT_MP_ENCODING_AES_KEY` | 服务号适配器 | P2 再配 |

纪律：
- 变量名可进 `.env.example`（空占位，沿用现行惯例），值永不入仓；部署用 `vercel env add` / 控制台。**配完必须验非空**（Vercel env 历史上有空值雷：配后以 §12 验收命令 0 的 503/401 分层响应确认为准）。
- `src/lib/env-consumers.ts` 注册表新增：
  `{ feature: 'Telegram channel', requirements: [['TELEGRAM_BOT_TOKEN'], ['TELEGRAM_WEBHOOK_SECRET'], ['CHANNELS_ENABLED']], behavior: 'explicit-failure', impact: 'Telegram webhook returns service unavailable.' }`
  —— 缺任一 → 路由 503 fail-closed，与 CRON_SECRET/hands 的既有语义对齐。

---

## 10. 可观测性

沿用 `src/lib/logger.ts` 分级语义（生产只出 warn/error，error 自动 Sentry）：**新增事件一律 `[Channel]` 前缀**：

| 事件 | 级别 | 说明 |
|---|---|---|
| `sig_fail` | warn（→不进 Sentry，量大） | 验签失败：平台、路径。注意绝不打出 secret 值 |
| `replay_dropped` | debug | 重放丢弃（噪音，生产静默） |
| `flood_limited` | warn | 单用户超 20/min |
| `busy_dropped` | warn | 在途回合冲突丢弃 |
| `daily_limit` / `hourly_limit` | warn | 配额触顶（含 userId 前 8 位） |
| `global_budget_hit` | warn | 全局熔断（值得盯） |
| `bind_created` | info + PostHog | 影子账号建立 |
| `turn_error` | **error → Sentry** | 回合异常（Letta 5xx/超时/发送失败三态都归此类，error message 带平台与 outcome） |
| `send_fail` | error → Sentry | sendMessage 两次尝试均败（HTML 降级也败） |
| `turn_complete` | PostHog（生产）、info（dev） | latency_ms / reply_chars / outcome / platform |

PostHog：`channel_message_received` / `channel_reply_sent`，属性 `trigger_source: 'telegram_webhook'`（snake_case，遵 docs/conventions.md）、`platform`、`locale`、`outcome`、`latency_ms`。

Sentry 纪律：`platform_username` 不进日志标签；token/secret 永不落日志（`sentry-scrub` 现行约定覆盖）。审计落库走既有 `logAIBehavior`，渠道回合与 Web 回合同表同 action（`tool_call`），保证 AI 行为审计单一事实源。

---

## 11. 安全清单（review 对照表）

- [ ] 常时比较 secret（timingSafeEqual）；长度不等先短路
- [ ] 签名通过后恒 200（防 TG 重试风暴）；签名失败 401 不带任何内部信息
- [ ] 验签在解析之前；rawBody 只读一次传两处
- [ ] fail-closed：env 缺失 → 503；未知平台 → 404；`CHANNELS_ENABLED` 默认关
- [ ] 外部报文 zod loose（防 Telegram 加字段炸解析），消费字段强类型
- [ ] `channel_bindings` RLS：UPDATE 带 WITH CHECK（148 守卫兼容）；admin client 仅服务端（`server-only` import 对齐 distributed-lock 先例）
- [ ] 影子账号邮箱不可投递域 + `email_confirm:true`；`platform_username` 存库但永不回显进消息（XSS/注入面归零：回显只用我们自己文案）
- [ ] sendMessage 目标 `chatRef` 只来自平台 payload（不可由我方 API 注入）；fetch 加 `AbortSignal.timeout(10_000)`
- [ ] 无 SSRF 面：出站仅 `api.telegram.org`（P2 加微信域名），URL 由常量拼接
- [ ] 配额同键共享 + 全局预算熔断（§8）

---

## 12. 分阶段落地与验收（API 级真实 HTTP，禁 mock 绿灯当验收）

> 验收环境：QA 站（symy-git-main-spark-huang-s-projects.vercel.app）或生产 symy.ai；`$BOT` = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`；TG 测试号 = owner 提供。

### 阶段 0：地基（迁移 + env）

验收命令 0（env 分层确认——先于一切）：
```bash
# 未配 env 时（CHANNELS_ENABLED 缺失）: fail-closed 分层可见
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<host>/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{}'
# 期望 503（channel 未启用）。配齐 env 后同命令期望变为 401（缺签名头）——两态都验。
# 未知平台:
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<host>/api/channels/fakebook/webhook" -d '{}'
# 期望 404
```
迁移验收：
```bash
# QA 库执行 153 后, 验 RLS 与 148 守卫兼容:
psql "$QA_DB_URL" -c "\d channel_bindings"                       # 表+唯一约束在
psql "$QA_DB_URL" -c "select policyname, cmd, with_check is not null as has_wc
  from pg_policies where tablename='channel_bindings';"           # 三行, update 行 has_wc = t
```

### 阶段 MVP：Telegram 文本全链（目标完成定义）

1. **注册 webhook**（一次性）：
```bash
curl -s -X POST "$BOT/setWebhook" -H 'Content-Type: application/json' \
  -d "{\"url\":\"https://<host>/api/channels/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
# 期望 {"ok":true,"result":true,...}
curl -s "$BOT/getWebhookInfo" | jq '{url, pending_update_count, last_error_message}'
# 期望 url 正确, pending=0, 无 last_error
```
2. **验签拒绝**（真实伪造包，错误 secret）：
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<host>/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -H 'X-Telegram-Bot-Api-Secret-Token: wrong" \
  -d '{"update_id":900001,"message":{"message_id":1,"from":{"id":900001,"is_bot":false,"first_name":"QA"},"chat":{"id":900001,"type":"private"},"date":1761000000,"text":"ping"}}'
# 期望 401
```
3. **端到端真消息**：真机 TG 测试号向 bot 发"帮我参谋要不要买件冲锋衣" → **bot 在 60s 内回单条终稿**；Vercel 日志含 `turn_complete`；`sendMessage` API 结果 ok。
4. **影子绑定落库**：
```bash
psql "$QA_DB_URL" -c "select platform, platform_user_id, user_id, locale, linked_at
  from channel_bindings order by linked_at desc limit 1;"          # 期望 telegram + 真实 user_id
```
5. **重放丢弃**：用正确 secret 重发步骤 3 的同 update_id 原始报文（curl 构造）→ HTTP 200 但**无第二次回复**（日志 `replay_dropped`，且 `distributed_locks` 出现 `channel:upd:telegram:*` 行）。
6. **配额同键映射**（不做 51 连发的烧钱 soak）：连发 3 条真消息后：
```bash
psql "$QA_DB_URL" -c "select key, value from distributed_locks where key like 'chat:daily:%';"
# 期望测试 userId 的键计数=3 —— 证明渠道与 Web 同键同配额
```
（可选 soak：当日打满 50 条验证拒答文案，owner 决定是否烧。）
7. **并发串行**：发一条长问题后 2s 内紧跟第二条 → 第二条立即收到"上一条还在回答中"轻提示。
8. **回归三件套**：
```bash
npx vitest run src/app/api/chat src/lib/channels src/lib/channel-chat   # 全绿（含 structure-lock）
npm run lint && npm run build
# Web 端真 HTTP 回归（QA 站, 浏览器会话 cookie）: /api/chat SSE 正常出流
```
9. **QA 站真浏览器**（09-21 令）：网页端发一条消息确认 Web 聊天无回归。

### 阶段 P2（各项先出补充设计再施工）

| 项 | 内容 | 验收锚点（真实 HTTP） |
|---|---|---|
| 账号绑定码 | 网页 `/api/channels/bind/code`（登录态）发码 → `/start CODE` 绑既有账号（合并影子） | 网页取码 curl + TG `/start CODE` 后 binding.user_id 变为网页账号 |
| 图片/语音输入 | TG `getFile` 下载（`/file/bot<token>/<path>`）→ 图片描述/ASR 进管线 | 真机发图 → bot 读懂并回复 |
| 推荐卡片 | inline keyboard / 微信 news 卡 → Web 深链 | 真机点按钮 → 打开正确落地页 |
| hands 购物车 | 影子用户 agent 的 symy-hands MCP 工具链验证（工具已存在，验证权限/会话） | TG 内说"帮我加购" → cart_lines 出现行 |
| wechat_mp 适配器 | 服务号 + 客服消息（§5.2 硬约束）；echostr 接入 | 微信测试号发消息 → 异步收到回复 |

---

## 13. developer 分阶段施工任务清单（文件级，每步带验收）

> 纪律：每任务 TDD（先测后码）、`zod .strict()`（自有契约）/loose（外部报文）、RLS WITH CHECK、commit 走显式路径（禁 `git add -A`）。全程不动 `src/app/api/chat/route.ts` 行为。

**T1 迁移 153 + 待部署登记**
- Create: `supabase/migrations/153_channel_bindings.sql`（§4.1 全文）；Modify: `supabase/migrations/PENDING-OWNER-DEPLOY.md`（追加条目：目的/影响/回滚 `DROP TABLE IF EXISTS public.channel_bindings CASCADE;`）
- 验收: §12 阶段 0 两条 psql 命令通过（本地 supabase 或 QA）。

**T2 env 注册与门控**
- Modify: `src/lib/env-consumers.ts`（§9 条目）、`.env.example`（空占位名）
- Create: `src/lib/channels/config.ts`（`channelsEnabled(platform)`、`channelGlobalBudget()`）
- Test: `src/lib/channels/__tests__/config.test.ts`
- 验收: `npx vitest run src/lib/channels/__tests__/config.test.ts` 绿；§12 验收命令 0 的 503/404 两态 curl 通过（路由 T8 落地后复跑）。

**T3 类型 + 注册表**
- Create: `src/lib/channels/types.ts`（§3 全文）、`src/lib/channels/registry.ts`（静态 map + `asyncPush=false` 拒注册守卫）
- Test: `src/lib/channels/__tests__/registry.test.ts`
- 验收: vitest 绿（含"未注册平台 null""asyncPush=false 注册抛错"两例）。

**T4 Telegram 验签**
- Create: `src/lib/channels/telegram/verify.ts`（timingSafeEqual；缺头/错值 → `{ok:false}`）
- Test: `src/lib/channels/telegram/__tests__/verify.test.ts`（正确/错误/缺失/长度不等四例）
- 验收: vitest 绿 + §12 命令 2（401 curl）通过。

**T5 Telegram client（发送）**
- Create: `src/lib/channels/telegram/client.ts`（sendMessage：4000 阈值分片、markdown→HTML 转换、400 降级纯文本重发一次、429 按 `retry_after` 重试、`AbortSignal.timeout(10s)`；sendChatAction）
- Test: `src/lib/channels/telegram/__tests__/client.test.ts`（分片边界/转义/降级链，fetch mock 仅此层允许）
- 验收: vitest 绿；真机：临时 `curl $BOT/sendMessage` 对拍一次确认 token 有效。

**T6 身份解析（影子账号）**
- Create: `src/lib/channels/identity.ts`（`resolveOrCreateBinding(msg)`：查 binding → miss 则 admin.createUser（确定性邮箱幂等）→ upsert binding → `getOrCreateAgentId`）
- Test: `src/lib/channels/__tests__/identity.test.ts`（对 QA Supabase 的集成测试；重复 resolve 幂等同 user_id）
- 验收: §12 步骤 4 的 psql 行出现且二次消息不新建账号。

**T7 回合核心（复用编排）**
- Modify: `src/app/api/chat/parts/daily-limit-guard.ts`（仅新增 `export const chatDailyKey = (userId: string) => ...` 与 `chatUserHourlyKey`；正文行为零改动）
- Create: `src/lib/channel-chat/run-channel-turn.ts`（§6.2 编排序，返回 `ChannelTurnResult`；审计/PostHog fire-and-forget）
- Test: `src/lib/channel-chat/__tests__/run-channel-turn.test.ts`；**必须复跑** `src/app/api/chat/parts/__tests__/daily-limit-guard.test.ts` 与 `route-structure-lock.test.ts`
- 验收: 上述三套 vitest 全绿（structure-lock 锚点 `await checkDailyChatLimit(` 未移动）。

**T8 webhook 路由**
- Create: `src/app/api/channels/[platform]/webhook/route.ts`（§2.3 快路径序 + `waitUntil` + `maxDuration=60`；GET：telegram 405）
- Test: `src/app/api/channels/[platform]/webhook/__tests__/route.test.ts`（401/404/503/200-ack/重放/洪水/忙 七态）
- 验收: §12 验收命令 0 + 命令 2 + 步骤 3/5/7 全过。

**T9 接线 runbook**
- Create: `docs/ops/telegram-webhook.md`（setWebhook/rotate secret（先改 env 再 setWebhook 双写）/getWebhookInfo 排障/deleteWeblog 下线流程）
- 验收: 按 runbook 从零执行 §12 命令 1 一次成功。

**T10 回归总闸**
- 命令: `npx vitest run && npm run lint && npm run build`；QA 站真浏览器 Web 聊天一条；§12 步骤 8。
- 全绿后走 arch 审 + QA 报告，再谈合并。

**P2 任务（另行细化，此处占位）**：T11 绑定码端点+`/start CODE` 分支；T12 媒体输入（getFile 下载→描述/ASR）；T13 推荐卡片与深链；T14 hands 影子用户链路验证；T15 wechat_mp 适配器（含 echostr GET 流）。

---

## 14. 风险与开放问题

1. **waitUntil 被 kill**（罕见）：现象=无回复+turn_error 日志。MVP 观测确认发生率，超标再加 outbox+cron 补偿（§5.1）。
2. **Supabase MAU 计费**：影子账号计入月活——量级=渠道真实活跃，随收入同向；owner 批迁移 153 时一并知会。
3. **首条消息延迟**：影子建号 + `getOrCreateAgentId` 预建叠加 LLM 回合，首条可能 20-40s；欢迎语在建号后立即先发（不等回合），观感可接受。
4. **getWebhookInfo 的 last_error**：上线后头 24h 盯一次（QA 站日志 + getWebhookInfo 双源）。
5. **Premium 文案**（渠道触达付费墙）：MVP 只说"明天再来"，付费引导话术归 P2 产品文案，不在本设计膨胀。
