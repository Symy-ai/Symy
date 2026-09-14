# we=me — API 接口文档

> 所有 API 路由的详细请求/响应规格

---

## 1. 健康检查

### `GET /api`

检查 API 服务是否正常运行。

**响应：**

```json
{
  "message": "Hello, world!"
}
```

---

## 2. Chat 对话 API

### 2.1 `POST /api/chat`

与 AI 伴侣 Symbio 进行对话，支持三级降级策略。

**请求体：**

```json
{
  "message": "我刚在 TikTok 上看到了一件衣服，好想买",
  "userId": "uuid",
  "impulseContext": {
    "score": 72,
    "amount": 89.99,
    "platform": "TikTok Shop",
    "category": "Fashion",
    "time": "23:47"
  }
}
```

**响应（SSE 流式）：**

```
data: {"content": "我"}
data: {"content": "理"}
data: {"content": "解"}
data: {"content": "你"}
...
data: {"content": "", "done": true}
```

**降级策略：**

1. Letta Agent（有状态对话 + 记忆持久化）
2. OpenAI Gateway（兼容 API）
3. z-ai-web-dev-sdk（兜底）

**错误响应：**

```json
{
  "error": "All LLM providers failed"
}
```

### 2.2 `GET /api/chat/history`

获取聊天历史记录，支持游标分页。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |
| `cursor` | string | ❌ | 分页游标（消息 ID） |
| `limit` | number | ❌ | 每页条数（默认 6） |

**响应：**

```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "帮我分析一下这笔消费",
      "created_at": "2025-01-15T23:47:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "我注意到这是一笔 $89.99 的 TikTok Shop 消费...",
      "reasoning": "User is showing impulse behavior at late night...",
      "created_at": "2025-01-15T23:47:05Z"
    }
  ],
  "nextCursor": "uuid",
  "hasMore": true
}
```

### 2.3 `POST /api/chat/history`

保存一条聊天消息。

**请求体：**

```json
{
  "userId": "uuid",
  "role": "user",
  "content": "帮我分析一下这笔消费",
  "impulseContext": "[Impulse context: ...]"
}
```

**响应：**

```json
{
  "id": "uuid",
  "created_at": "2025-01-15T23:47:00Z"
}
```

### 2.4 `DELETE /api/chat/history`

删除聊天消息。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |
| `messageId` | string | ❌ | 删除单条消息 ID（不传则清空全部） |

**响应：**

```json
{
  "deleted": true,
  "count": 15
}
```

---

## 3. Email 邮件监控 API

### 3.1 `GET /api/email/connect`

发起 Gmail OAuth 授权流程（Step 1）。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |

**响应：**

```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

前端应将用户重定向到 `authUrl` 完成授权。

### 3.2 `GET /api/email/callback`

Gmail OAuth 授权回调（Step 2）。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | Google 授权码 |
| `state` | string | ✅ | 防 CSRF 的 state 参数 |

**响应：**

成功后重定向回应用主页，邮箱连接已建立。

### 3.3 `POST /api/email/scan`

扫描 Gmail 收件箱获取购物收据。

**请求体：**

```json
{
  "userId": "uuid"
}
```

**响应：**

```json
{
  "scanned": 47,
  "found": 12,
  "receipts": [
    {
      "id": "uuid",
      "platform": "tiktok_shop",
      "order_id": "TT-SHOP-12345",
      "item_name": "Wireless Earbuds",
      "amount": 29.99,
      "impulse_score": 65,
      "received_at": "2025-01-14T22:30:00Z"
    }
  ]
}
```

### 3.4 `POST /api/email/imap-connect`

通过 IMAP 直连邮箱并自动执行首次扫描。

**请求体：**

```json
{
  "userId": "uuid",
  "email": "user@163.com",
  "password": "authorization_code",
  "provider": "163"
}
```

**响应：**

```json
{
  "connected": true,
  "email": "user@163.com",
  "provider": "163",
  "scanResult": {
    "scanned": 32,
    "found": 8,
    "receipts": [...]
  }
}
```

### 3.5 `POST /api/email/resync`

使用已存储的 IMAP 凭据重新同步邮箱。

**请求体：**

```json
{
  "userId": "uuid"
}
```

**响应：**

```json
{
  "synced": true,
  "newReceipts": 3,
  "receipts": [...]
}
```

### 3.6 `GET /api/email/status`

获取邮箱连接状态。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |

**响应：**

```json
{
  "connected": true,
  "provider": "gmail",
  "email": "user@gmail.com",
  "lastSyncAt": "2025-01-15T10:00:00Z",
  "totalReceipts": 47,
  "impulseCount": 12
}
```

### 3.7 `GET /api/email/receipts`

获取收据列表。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |
| `status` | string | ❌ | 筛选状态（pending/impulse/rational/refunded） |
| `limit` | number | ❌ | 每页条数 |
| `offset` | number | ❌ | 偏移量 |

**响应：**

```json
{
  "receipts": [
    {
      "id": "uuid",
      "platform": "amazon",
      "order_id": "112-1234567-1234567",
      "item_name": "LED Strip Lights",
      "amount": 24.99,
      "currency": "USD",
      "impulse_score": 55,
      "status": "pending",
      "received_at": "2025-01-14T22:30:00Z",
      "refund_deadline": "2025-01-29T22:30:00Z"
    }
  ],
  "total": 47
}
```

### 3.8 `PATCH /api/email/receipts`

更新收据状态。

**请求体：**

```json
{
  "receiptId": "uuid",
  "status": "impulse"
}
```

**响应：**

```json
{
  "updated": true,
  "receipt": { ... }
}
```

### 3.9 `DELETE /api/email/receipts`

删除收据（批量或单条）。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |
| `receiptId` | string | ❌ | 单条删除（不传则清除全部） |

**响应：**

```json
{
  "deleted": true,
  "count": 5
}
```

### 3.10 `DELETE /api/email/disconnect`

断开邮箱连接。

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 用户 ID |

**响应：**

```json
{
  "disconnected": true
}
```

### 3.11 `POST /api/email/seed-test`

插入测试收据数据（仅用于开发环境）。

**请求体：**

```json
{
  "userId": "uuid"
}
```

**响应：**

```json
{
  "seeded": true,
  "count": 15,
  "platforms": ["tiktok_shop", "amazon", "shein", "temu", "ebay"]
}
```

---

## 4. Buddy 伴侣状态 API

### 4.1 `GET /api/buddy/state`

获取当前用户的 Buddy 伴侣状态。

**认证：** 需要登录（Cookie-based）

**响应：**

```json
{
  "buddyState": {
    "vitality": 72,
    "tokens": 156,
    "health": "healthy",
    "level": 3,
    "xp": 45,
    "xpToNext": 100,
    "streak": 7,
    "dreamFunds": [
      { "id": "df-1", "name": "Pay Off Credit Card", "target": 2000, "current": 340, "emoji": "💳" }
    ],
    "badges": ["impulse_shield", "first_save", "streak_7"],
    "totalSaved": 847,
    "challengesCompleted": 12,
    "lastDrainAt": "2026-05-19T06:00:00Z",
    "updatedAt": "2026-05-19T06:00:00Z"
  }
}
```

**错误响应：**

```json
{ "error": "Not authenticated" }  // 401
{ "buddyState": null }            // 用户无 buddy_state 行
```

### 4.2 `PUT /api/buddy/state`

更新/创建 Buddy 伴侣状态（upsert，INSERT ON CONFLICT UPDATE）。

**认证：** 需要登录（Cookie-based）

**请求体：**

```json
{
  "buddyState": {
    "vitality": 75,
    "tokens": 159,
    "health": "thriving",
    "level": 3,
    "xp": 55,
    "xpToNext": 100,
    "streak": 7,
    "dreamFunds": [...],
    "badges": ["impulse_shield", "first_save", "streak_7"],
    "totalSaved": 847,
    "challengesCompleted": 12,
    "lastDrainAt": "2026-05-19T06:00:00Z"
  }
}
```

**响应：**

```json
{ "success": true, "updatedAt": "2026-05-19T06:01:00Z" }
```

**错误响应：**

```json
{ "error": "Not authenticated" }              // 401
{ "error": "Missing buddyState" }             // 400
{ "error": "Invalid JSON" }                   // 400
{ "error": "Failed to save buddy state" }     // 500
```

**字段映射：** 请求/响应使用 camelCase，数据库存储使用 snake_case（API 自动转换）

---

## 5. Auth 认证 API

认证由 Supabase Auth 处理，以下为前端调用方式：

### 5.1 注册

```typescript
const { error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securepassword',
});
// 需要邮件确认
```

### 5.2 邮箱密码登录

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'securepassword',
});
```

### 5.3 Magic Link 登录

```typescript
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
});
// 发送包含登录链接的邮件
```

### 5.4 Auth 回调

`GET /auth/callback?code=xxx` — Supabase Auth code exchange，建立会话。

---

## 6. Admin 管理 API

### 6.1 `GET /api/admin/letta`

读取当前 Letta Agent 配置，包括 agent 信息、记忆块、工具列表和 MCP Servers。

**认证：** 需要 Admin API Key（二选一）

| Header | 格式 | 示例 |
|--------|------|------|
| `Authorization` | `Bearer <ADMIN_API_KEY>` | `Bearer sk-admin-xxxx` |
| `X-Admin-Key` | `<ADMIN_API_KEY>` | `sk-admin-xxxx` |

**环境变量：** `ADMIN_API_KEY` 必须在 Vercel 中配置，否则所有 Admin 请求返回 401。

**响应：**

```json
{
  "agent": {
    "id": "agent-uuid",
    "name": "Symy Companion",
    "description": "...",
    "system": "You are Symy, a symbiotic AI financial companion..."
  },
  "memoryBlocks": [
    { "id": "block-uuid", "label": "user_id", "value": "...", "limit": 100 }
  ],
  "tools": [
    { "id": "tool-uuid", "name": "add_tokens", "tool_type": "mcp", "description": "..." }
  ],
  "mcpServers": [
    { "id": "server-uuid", "name": "weme-mcp", "server_url": "...", "server_type": "streamable_http" }
  ]
}
```

**错误响应：**

```json
{ "error": "Missing authentication. Provide Authorization: Bearer <key> or X-Admin-Key: <key> header." }  // 401
{ "error": "Invalid admin API key in Authorization header." }  // 401
{ "error": "Admin API not configured. Set ADMIN_API_KEY environment variable." }  // 401
```

### 6.2 `POST /api/admin/letta`

执行 Letta Agent 管理操作。

**认证：** 同 6.1，需要 Admin API Key。

**请求体：**

```json
{
  "action": "sync_all"
}
```

**支持的 action 列表：**

| Action | 说明 | 额外参数 |
|--------|------|----------|
| `update_system_prompt` | 从 doc/AI_Prompt.md 读取并更新系统提示词 | — |
| `update_memory_block` | 更新记忆块 | `label`, `value` |
| `create_memory_block` | 创建新记忆块并挂载到 Agent | `label`, `value`, `limit` |
| `recompile` | 重编译 Agent | — |
| `register_mcp_server` | 注册标准 MCP Server | `server_name` (可选) |
| `refresh_mcp_server` | 刷新 MCP Server 工具列表 | `server_id` |
| `attach_mcp_tools` | 挂载 MCP 工具到 Agent | `server_id` |
| `register_mcp_tools` | 注册 MCP 工具为 Custom Tools（旧方式） | — |
| `list_mcp_servers` | 列出已注册的 MCP Servers | — |
| `sync_all` | 一键同步（prompt + MCP + memory + tools + recompile） | — |

**sync_all 响应示例：**

```json
{
  "success": true,
  "logs": [
    "System prompt updated (2847 chars)",
    "user_id memory block already exists (id: block-uuid)",
    "MCP server \"weme-mcp\" already exists (id: server-uuid)",
    "MCP tools: 0 attached, 6 already attached, 6 total",
    "Agent recompiled"
  ],
  "mcpServerId": "server-uuid"
}
```

**错误响应：**

```json
{ "error": "Missing authentication..." }  // 401 — 无凭证
{ "error": "Invalid admin API key..." }   // 401 — 错误凭证
{ "error": "Unknown action. Use: ..." }   // 400 — 未知 action
{ "error": "Letta not configured" }       // 400 — 缺少 Letta 环境变量
```

---

## 7. 错误码约定

| HTTP 状态码 | 含义 | 示例场景 |
|------------|------|---------|
| 200 | 成功 | 数据查询成功 |
| 201 | 创建成功 | 消息保存成功 |
| 400 | 请求参数错误 | 缺少 userId |
| 401 | 未认证 | 会话过期 |
| 403 | 无权限 | 访问他人数据（RLS） |
| 404 | 资源不存在 | 收据 ID 不存在 |
| 500 | 服务器错误 | LLM 全部降级失败 |
