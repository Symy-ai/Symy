# Telegram Webhook 接线 Runbook（T9）

- **适用**：Symy Telegram 渠道的接线、secret 轮换、验收、排障、下线（QA 站与生产 symy.ai）。
- **设计依据**：`docs/design/social-channel-adapter.md` §9（密钥与配置）、§12（分阶段验收）。
- **代码面状态**：T1-T8 + M1-M4 已合 main（7df1237d）。本 runbook 纯文档，不含任何代码改动；接线中发现需代码微调的事项只记录在 §6 挂账，不改代码。
- **部署顺序铁律**：**迁移 153 → 配 env → setWebhook**，不可倒置。表未建而 webhook 先通 = 每条消息走「建影子号 → binding insert 失败 → 孤儿补偿删除」空转放大。
- **平台硬事实**：一个 bot 只能挂一个 webhook URL（`getWebhookInfo.url` 单值）。QA 与生产若为不同实例，**必须用两个不同 bot**（BotFather 各建一个）；实例关系探测见 §0.3。

---

## 0. 前置条件

### 0.1 owner：BotFather 建 bot（2 分钟）

1. Telegram 里找 `@BotFather` → `/newbot` → 起显示名 + username（必须以 `bot` 结尾）。
2. 拿到 token（形如 `123456789:AAE...`）= `TELEGRAM_BOT_TOKEN`。
3. token 泄露处理：BotFather → `/revoke` 立即换新，再走 §2.2 轮换流程。
4. 双环境策略：QA 一个 bot、生产一个 bot（见上方平台硬事实）。bot 创建是密钥类事项，owner 亲手做，token 绝不入仓、不进聊天记录。

### 0.2 Vercel env 配置清单与顺序

| 变量 | 值 | 层级 | 必需 |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather 给的 token | production + preview | ✅ |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 24` 生成（48 个 hex 字符，满足 TG `secret_token` 1-256 字符 `[A-Za-z0-9_-]` 约束） | production + preview | ✅ |
| `CHANNELS_ENABLED` | `telegram`（逗号列表，空/缺省 = 全关 → 503 fail-closed） | production + preview | ✅ |
| `CHANNEL_GLOBAL_DAILY_BUDGET` | 全局熔断日预算，默认 2000（不配即 2000；非法值也回落 2000） | 可选 | ⭕ |

三必需变量缺任一 → 路由 503（`src/lib/env-consumers.ts` 注册的 explicit-failure 语义）。
注意：`CHANNEL_IP_WHITELIST_ENFORCE` 在 `.env.example` 有占位但**无实现**（挂账 E3），配了也无效果，勿配。

配置命令（仓库根目录，`vercel link` 一次性）：

```bash
cd /home/spark/src/github/Symy
vercel link   # 首次：选择 Symy 项目

export TELEGRAM_BOT_TOKEN="<粘贴 BotFather token>"
export TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 24)"

printf '%s' "$TELEGRAM_BOT_TOKEN" | vercel env add TELEGRAM_BOT_TOKEN production
printf '%s' "$TELEGRAM_BOT_TOKEN" | vercel env add TELEGRAM_BOT_TOKEN preview
printf '%s' "$TELEGRAM_WEBHOOK_SECRET" | vercel env add TELEGRAM_WEBHOOK_SECRET production
printf '%s' "$TELEGRAM_WEBHOOK_SECRET" | vercel env add TELEGRAM_WEBHOOK_SECRET preview
printf 'telegram' | vercel env add CHANNELS_ENABLED production
printf 'telegram' | vercel env add CHANNELS_ENABLED preview
```

env 变更不会自动生效，**必须重部署**：

```bash
vercel redeploy <当前生产部署 URL>   # 或控制台 Deployments → ⋯ → Redeploy
```

配完必须验非空。**不要信 `vercel env pull` 的空值显示**（sensitive 变量历史上有空值假象坑）——以 §3.1 行为探测为准：配齐前 503、配齐并部署后 401，两态分层即证明 env 已生效且非空。

### 0.3 环境实例探测（QA 站 vs 生产是否同一部署）

QA 站 `symy-git-main-spark-huang-s-projects.vercel.app` 是 main 分支部署的分支别名，若与 `symy.ai` 同属一个 Vercel 项目则**同一实例**（env 共享，一个 bot 接一次即可）；若分离两项目则按双实例处理。探测方法（在 §0.2 env 配好并重部署后执行）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://symy-git-main-spark-huang-s-projects.vercel.app/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://symy.ai/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{}'
# 两边都 401 → 同一实例（env 已全局生效），单 bot 策略
# 一边 401 一边 503 → 两个实例，第二个项目重复 §0.2 全部步骤，且用另一个 bot
```

---

## 1. 数据库：迁移 153 部署 + database.types.ts regen

### 1.1 部署（PENDING-OWNER-DEPLOY.md 流程）

153 已登记在 `supabase/migrations/PENDING-OWNER-DEPLOY.md`（含目的/影响/回滚）。注意：待部署队列实际是 **145/146/148/149/150/151/152/153** 八件——PENDING 清单漏登了 150/151/152（挂账 E2，文件都在 `supabase/migrations/`，均为合法迁移），按目录序号全量执行即可：

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push   # 按文件名序应用所有未应用迁移：145→146→148→149→150→151→152→153
```

不想跑 CLI 的替代：Supabase 控制台 → SQL Editor，按序号逐个粘贴执行上述 8 个迁移文件全文。
153 的回滚（如需）：`DROP TABLE IF EXISTS public.channel_bindings CASCADE;`

### 1.2 部署后验证（表 + RLS + 唯一约束）

SQL Editor（或 psql）执行：

```sql
-- 期望 3 行：channel_bindings_select_own / insert_own / update_own，且 update_own 行 has_wc = t
select policyname, cmd, with_check is not null as has_wc
from pg_policies where tablename='channel_bindings';

-- 期望 pkey + unique(platform, platform_user_id)（148 号 RLS 守卫与 153 天然兼容）
select conname, contype from pg_constraint
where conrelid = 'public.channel_bindings'::regclass;
```

### 1.3 database.types.ts regen 与零漂移验证

背景：153 未部署期间，`src/lib/database.types.ts` 的 `channel_bindings` 块是 commit 6adcc1a9 **手改收窄的过渡态**。owner 部署 153 后必须 regen 并核对：

```bash
# ① 从真库生成
supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > /tmp/generated-types.ts

# ② 用生成产物替换手改过渡态
cp /tmp/generated-types.ts src/lib/database.types.ts

# ③ 零漂移核对：diff 只允许出现在 channel_bindings 块内（过渡期的缩进差异）
git diff src/lib/database.types.ts
#    出现任何其他表/字段的增删 = schema 与仓库预期漂移 → 停下核对，勿盲提交

# ④ 类型检查（仓库默认堆会 OOM，须调堆——既有事实）
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit   # 期望 0 错

# ⑤ 显式路径提交
git add src/lib/database.types.ts
git commit -m "chore(db): regen database.types.ts after migration 153 deploy"
```

CI 守卫：`.github/workflows/db-types-check.yml` 会在配好 `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` 两个 GitHub secrets 后自动做同款 regen+diff 检查（当前 secrets 未配，CI 静默跳过——见 `doc/OWNER-DECISION-PACK-2026-10.md` 第三节）。

---

## 2. setWebhook 接线

前置：§1 迁移已部署、§0.2 env 已配并重部署（顺序铁律）。

### 2.1 首次接线

```bash
export TELEGRAM_BOT_TOKEN="<粘贴 BotFather token>"
export TELEGRAM_WEBHOOK_SECRET="<与 Vercel env 完全相同的值>"
export CHANNEL_HOST="https://symy-git-main-spark-huang-s-projects.vercel.app"   # QA 站
# export CHANNEL_HOST="https://symy.ai"   # 生产环境用这行

# 注册 webhook（drop_pending_updates=true 清掉接线前 bot 的历史积压，防旧消息涌入烧回合）
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${CHANNEL_HOST}/api/channels/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}"
# 期望 {"ok":true,"result":true,...}

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" \
  | jq '{url, pending_update_count, last_error_message, last_error_date}'
# 期望 url 正确、pending_update_count=0、无 last_error_message
```

### 2.2 secret 轮换（双写流程：先改 env，再 setWebhook）

顺序原理：先改 env 后，到 setWebhook 完成前的窗口内，Telegram 仍按旧 secret 投递 → 我方 401 → **Telegram 自动退避重试数小时，消息不丢只延迟**；setWebhook 落定后重试的 update 带新 secret 立即恢复。反过来（先 setWebhook）同样会 401，但窗口期不可控，统一按设计的「先 env 后 setWebhook」执行。选低峰操作，窗口 ≈ 一次 redeploy（1-2 分钟）。

```bash
NEW_SECRET="$(openssl rand -hex 24)"

# ① 先改 env（production 与 preview 都要；新 secret 只存在于 shell 与 Vercel env，勿落文件/日志/截图）
vercel env rm TELEGRAM_WEBHOOK_SECRET production -y   # 或控制台直接改值
printf '%s' "$NEW_SECRET" | vercel env add TELEGRAM_WEBHOOK_SECRET production
vercel env rm TELEGRAM_WEBHOOK_SECRET preview -y
printf '%s' "$NEW_SECRET" | vercel env add TELEGRAM_WEBHOOK_SECRET preview

# ② 重部署使新 env 生效
vercel redeploy <当前生产部署 URL>   # 或控制台 Deployments → ⋯ → Redeploy

# ③ 再 setWebhook 写入同一个新值（双写完成，投递恢复）
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${CHANNEL_HOST}/api/channels/telegram/webhook\",\"secret_token\":\"${NEW_SECRET}\",\"allowed_updates\":[\"message\"]}"
# 期望 {"ok":true,"result":true,...}

# ④ 验证：pending 逐渐清零、无 last_error；真机发一条消息确认收到回复
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" \
  | jq '{url, pending_update_count, last_error_message}'
```

---

## 3. 验收清单（设计 §12 阶段 MVP）

> 逐项可复制执行；`${CHANNEL_HOST}` / `${TELEGRAM_WEBHOOK_SECRET}` 沿用 §2.1 的 export。全过才算接线完成。

### 3.1 命令 0：env 分层确认（先于一切）

```bash
# a) POST 无签名头——配 env 前期望 503（渠道未启用），配齐并重部署后期望 401（缺签名头）。两态都要见过。
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{}'

# b) 未知平台——期望 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/fakebook/webhook" \
  -H 'Content-Type: application/json' -d '{}'

# c) 路由存在性 sanity——GET telegram 期望 405（若 404 = 构建路由树缺 /api/channels/[platform]/webhook，先查 build）
curl -s -o /dev/null -w '%{http_code}\n' "${CHANNEL_HOST}/api/channels/telegram/webhook"
```

### 3.2 命令 2：验签拒绝（真实伪造包，错误 secret）

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' \
  -H "X-Telegram-Bot-Api-Secret-Token: wrong-secret" \
  -d '{"update_id":900001,"message":{"message_id":1,"from":{"id":900001,"is_bot":false,"first_name":"QA"},"chat":{"id":900001,"type":"private"},"date":1761000000,"text":"ping"}}'
# 期望 401；Vercel 日志出现 [Channel] sig_fail reason=bad_signature
```

### 3.3 步骤 3：端到端真消息

真机 TG 测试号（大陆网络需代理）私聊 bot：

1. 发 `/start` → 期望**秒回欢迎语**（/start 短路不进 LLM，M3 行为）。
2. 发「帮我参谋要不要买件冲锋衣」→ 期望 **60s 内收到单条终稿**（典型 5-30s；首条消息含影子建号+agent 预建，可能 20-40s）。

### 3.4 步骤 4：影子绑定落库

```sql
select platform, platform_user_id, user_id, locale, linked_at
from channel_bindings order by linked_at desc limit 1;
-- 期望 platform=telegram + 真实 platform_user_id + user_id 为 uuid
select email from auth.users where email like 'tg-%@channels.symy.internal' order by created_at desc limit 1;
-- 期望影子账号（不可投递域）；再发一条消息后 channel_bindings 仍只有一行（不重复建号）
```

### 3.5 步骤 5：重放丢弃（零 LLM 成本版）

同一 `update_id` 原文发两次（用 `/start` 短路消息，不烧回合）：

```bash
UPDATE='{"update_id":900002,"message":{"message_id":1,"from":{"id":900002,"is_bot":false,"first_name":"QA-Replay","language_code":"zh"},"chat":{"id":900002,"type":"private"},"date":1761000000,"text":"/start"}}'

# 第一次：期望 200 + 收到欢迎语（影子账号 QA-Replay 建立）
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' \
  -H "X-Telegram-Bot-Api-Secret-Token: ${TELEGRAM_WEBHOOK_SECRET}" \
  -d "$UPDATE"

# 第二次（同 update_id 原文重放）：期望 200 + 无任何新消息
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' \
  -H "X-Telegram-Bot-Api-Secret-Token: ${TELEGRAM_WEBHOOK_SECRET}" \
  -d "$UPDATE"
```

```sql
select key from distributed_locks where key like 'channel:upd:%';
-- 期望出现 channel:upd:telegram:900002 行（去重锁 24h TTL）
```

注：`replay_dropped` 是 debug 级日志，**生产不可见**——以 DB 锁行 + 无第二次回复为准。若要验「文本消息重放」（对齐设计原文），把 `text` 换普通文本连发两条即可——第一条会真实烧一个 LLM 回合并回复，第二条静默。

### 3.6 步骤 6：配额同键映射（渠道与 Web 共享 50/天）

真机连发 **3 条普通文本**（`/start` 不计数，别用它凑数），然后：

```sql
select key, value from distributed_locks where key like 'chat:daily:%';
-- 期望步骤 3.4 绑定的影子 userId 键 value=3 —— 证明渠道与 Web 同键同配额，无双表面套利
```

（烧钱 soak 打满 50 条验证拒答文案为可选项，owner 决定。）

### 3.7 步骤 7：并发串行

真机发一条长问题，**2 秒内**紧跟第二条 → 第二条应**立即**收到「上一条还在回答中」轻提示（不排队、不丢锁）。
注意：轻提示自身限频 1 次/分钟（M2 防线）——60s 内重复触发只提示一次，属预期行为非故障。

### 3.8 收尾回归（§12 步骤 8/9 摘要）

```bash
npx vitest run src/app/api/chat src/lib/channels src/lib/channel-chat   # 全绿（含 structure-lock）
npm run lint && npm run build
```

外加 QA 站真浏览器发一条 Web 聊天确认主链无回归（09-21 令）。

---

## 4. 排障

### 4.1 第一工具：getWebhookInfo

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" \
  | jq '{url, has_custom_certificate, pending_update_count, last_error_date, last_error_message}'
```

| last_error_message | 含义 | 处置 |
|---|---|---|
| `Wrong response from the webhook: 401 Unauthorized` | env 的 `TELEGRAM_WEBHOOK_SECRET` ≠ setWebhook 的 `secret_token` | 走 §2.2 轮换流程对齐双写 |
| `Wrong response from the webhook: 503 Service Unavailable` | `CHANNELS_ENABLED` 未配/未生效/三必需 env 缺一 | §0.2 检查 + redeploy，再以 §3.1 行为探测确认 |
| `Read timeout` / `Connection timeout` | 投递超时（ack 设计 <1s，不应出现） | 查 Vercel 状态页 + 该时段部署记录 |
| `url` 字段为空 | webhook 从未设置或已被 deleteWebhook | 重跑 §2.1 |

上线后头 24h 至少盯一次（设计 §14-4：QA 站日志 + getWebhookInfo 双源）。

### 4.2 症状速查

| 症状 | 根因方向 |
|---|---|
| 消息全量 401 | secret 双写失配（env vs setWebhook） |
| 消息全量 503 | 渠道门控未开（env 缺失或未重部署生效） |
| TG 侧无错误但用户没收到回复 | 回合异常或 waitUntil 被平台杀 → Vercel 日志/Sentry 过滤 `[Channel] turn_error`；注意成功路径（turn_complete）生产 info 级**不可见**，以 TG 收到消息 + DB 行为准 |
| setWebhook 返回 409 冲突 | 同 token 有 getUpdates 轮询脚本在跑 → 停掉轮询再 setWebhook |
| bot 回复被限速/延迟 | sendMessage 429：client 已按 `retry_after`（cap 30s）自动重试，查 `[Channel]` 日志确认 |
| `vercel env pull` 显示空值 | sensitive 变量显示不可全信（历史坑）→ 以 §3.1 行为探测为准 |
| 本机 curl api.telegram.org 超时 | 大陆网络需代理（bot 终端用户同理） |

### 4.3 Vercel 日志过滤

控制台：项目 → Logs（Observability）→ 搜索框输入 `[Channel]`。CLI：

```bash
vercel logs <deployment-url> 2>&1 | grep '\[Channel\]'
```

关键字对照表（实码字符串；生产只出 warn/error，error 自动进 Sentry）：

| 日志串 | 级别 | 生产可见 | 含义 |
|---|---|---|---|
| `[Channel] sig_fail` | warn | ✅ | 验签失败（missing_header / bad_signature） |
| `[Channel] not_enabled` | warn | ✅ | CHANNELS_ENABLED 未含该平台（503 路径） |
| `[Channel] unknown_platform` | warn | ✅ | 未注册平台（404 路径） |
| `[Channel] flood_limited` | warn | ✅ | 单用户超 20 msg/min |
| `[Channel] busy_dropped` | warn | ✅ | 在途回合冲突丢弃 |
| `[Channel] daily_limit` / `hourly_limit` | warn | ✅ | 用户配额触顶（含 userId 前 8 位） |
| `[Channel] global_budget_hit` | warn | ✅ | 全局预算熔断（值得盯） |
| `[Channel] turn_error` | error | ✅ + Sentry | 回合异常（outcome=bind_failed / send_failed / exception / agent_unavailable / empty_reply / error） |
| `[Channel] welcome_send_failed` / `light_notice_send_failed` | warn | ✅ | 出站欢迎语/轻提示发送失败 |
| `[Channel] turn_no_reply` | warn | ✅ | 回合完成但无文案可发 |
| `[Channel] start_command_ack` | info | ❌ | /start 短路确认（生产不可见） |
| `[Channel] bind_created` | info | ❌ | 影子绑定建立（生产以 DB 行为准） |
| `[Channel] turn_complete` | info | ❌ | 回合成功（生产不可见；PostHog 事件未发=挂账 A2，观测缺口见 §6） |
| `[Channel] replay_dropped` | debug | ❌ | 重放丢弃（生产静默，以 distributed_locks 行为准） |

---

## 5. 下线流程

顺序：**先 deleteWebhook 再关 env**——反过来的话 Telegram 会吃到 503 并退避重试数小时（重试风暴）。在途回合（waitUntil）不受影响，跑完即止。

```bash
# ① 停入口（drop_pending_updates=false 保留积压，后续重接线可补投；事故下线改 true 丢弃）
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook" \
  -H 'Content-Type: application/json' -d '{"drop_pending_updates":false}'
# 期望 {"ok":true,"result":true,...}

# ② 关渠道开关（fail-closed）
vercel env rm CHANNELS_ENABLED production -y
vercel env rm CHANNELS_ENABLED preview -y

# ③ 重部署生效
vercel redeploy <当前生产部署 URL>

# ④ 验证回到 503
curl -s -o /dev/null -w '%{http_code}\n' -X POST "${CHANNEL_HOST}/api/channels/telegram/webhook" \
  -H 'Content-Type: application/json' -d '{}'
# 期望 503
```

- 下线后 token/secret 可保留在 env（不构成攻击面：CHANNELS_ENABLED 关 = 路由 503 fail-closed）。重启只需：恢复 `CHANNELS_ENABLED` → redeploy → §2.1 setWebhook。
- 彻底废弃 bot：BotFather `/revoke` 作废 token，再删两个 TELEGRAM_* env。
- deleteWebhook 后同 token 可用 `getUpdates` 轮询接管（本地调试场景）。

---

## 6. 挂账记录（接线时知悉；本 runbook 不改代码）

### 架构审建议项 A1-A3（终审挂账，delta 复审确认未顺手处理）

| # | 项 | 位置 | 事实与修法方向 |
|---|---|---|---|
| A1 | premium 快照失败语义注释失真 | `src/lib/channel-chat/run-channel-turn.ts`（premium 判定注释 + 对应测试名） | 注释声称与 Web 端 fail-open 语义一致，实际渠道是 fail-closed（snapshot null → 按免费档限流，对影子用户从严）。**行为方向正确，失真的是注释/测试名**——推荐改注释为「渠道侧有意 fail-closed」+ 测试名改「fail-closed 施加免费档限额」，不动行为 |
| A2 | PostHog channel_* 事件未发 | run-channel-turn.ts + route.ts processTurn | 设计 §10 规定的 `channel_message_received` / `channel_reply_sent` 事件未实现；现状只有 `$ai_generation`（trigger_source='channel_turn'）。叠加 `bind_created`/`turn_complete` 均为 info 级生产不可见 → 生产侧成功漏斗暂无遥测。**上线盯 24h（§14-4）前建议补齐**，否则只能靠 warn/error + DB 行反向推断 |
| A3 | 验签后 try-catch 纵深未加 | route.ts POST 验签通过后整段 | 当前 Telegram parse 可证明不抛（内层 try/catch + safeParse），但未来他平台 adapter.parse 抛错会 500 → 触发 TG 重试风暴。铁律的字面实现（整段包 try/catch → catch 记 error + 仍返 200），约 5 行，防未来适配器踩雷 |

### Delta 复审 4 条观察（7df1237d，全 P2/P3 不阻断）

| # | 观察 | 说明 |
|---|---|---|
| D1 | **`'/start CODE'` 形态前瞻（最重要，T11 必读）** | `src/lib/channels/telegram/parse.ts` 精确匹配 `text === '/start'` 才走 command_start 短路——深链绑定码形态 `/start CODE` **不命中**，会当作普通文本进 LLM 烧回合。T11 绑定码设计（网页发码 → `t.me/<bot>?start=CODE` → 合并影子账号）**必须**在此分支处理 payload 形态，否则绑定码会被 LLM 当闲聊消费掉 |
| D2 | M2 测试两请求共用同一 update_id | 靠无状态 dedup mock 双放行才到达 flood/notice 分支；生产语义是两条不同 update_id 连发。建议后续改异 id 更贴真（不影响现有断言有效性） |
| D3 | M4 warn 文案精度 | 影子号补偿删除的 warn 文案「shadow user compensated」无条件打——deleteUser 实际失败时略过度声明（失败=遗留孤儿，无安全面，注释已论证）。catch 内可补 debug 日志 |
| D4 | M1 budget 双调用 | `channelGlobalBudget()` 在闸判定与 warn 日志各调一次——纯函数幂等，无害 |

### 接线相关旁挂账

- **E2**：`PENDING-OWNER-DEPLOY.md` 漏登 150/151/152（本 runbook §1.1 已按八件全量执行兜底；清单本身待补登）。
- **E3**：`CHANNEL_IP_WHITELIST_ENFORCE` 占位无实现（§0.2 已注明勿配）。
