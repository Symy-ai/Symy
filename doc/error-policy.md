# Error Policy — Symy AI

> 🔧 Round 126 用户决策 7 (#7): 统一 fail-closed vs fail-open 决策
> 
> 目的: 消除 8+ 处独立做同一个 tradeoff (DB 失败时删 agent? 返回 null 还是 throw? fallback 还是 fail-closed?)
> 每次新代码遇到同样的 failure mode 时, 查此文档而非重新决策。

## 原则

1. **用户数据安全 > 用户体验 > 功能可用性**
2. **Fail-closed (拒绝操作) 优于 Fail-open (静默降级)** — 除非明确标注例外
3. **Silent failure 是 bug** — 所有 catch 必须至少 logger.error (不是 logger.warn)
4. **审计优先** — 失败时写 health_events 审计记录, 让 ops 能发现

## Failure Mode 决策表

| Failure Mode | 决策 | 理由 | 例外 |
|---|---|---|---|
| **DB 连接失败 (SELECT)** | Fail-closed: 返回 500 | 返回 stale 数据可能误导用户决策 | GET /api/buddy/state 读 dream_funds 表失败 → 500 (不 fallback 到已删除的 JSONB) |
| **DB 连接失败 (INSERT/UPDATE)** | Fail-closed: 返回 500 + 不回滚已成功的前置操作 | 回滚引入更多失败点; 500 让客户端重试 | complete_challenge CAS 成功后 applyBuddyStateDelta 失败 → 回滚 challenge status (因为 CAS 占用了唯一 active slot) |
| **DB 连接失败 (DELETE)** | Fail-closed: 返回 500 | 用户期望删除成功; 静默失败导致 stale 数据 | — |
| **RPC 调用失败** | Fail-closed: 返回 500, **不 fallback 到已知有 bug 的旧路径** | 旧路径有竞态/TOCTOU bug, fallback 重新引入已修 bug | create_challenge_atomic RPC 返回 42883 (function not found) → fallback 到两步 (向后兼容, migration 未部署) |
| **Letta API 失败** | Fail-closed: 返回 503 "AI 正在初始化" + **退还用户额度** | 用户不应为 AI 服务故障付费 | — |
| **LLM Gateway 失败** | Fallback 到 z-ai-sdk (沙箱) | 沙箱 LLM 是合理降级, 不涉及数据安全 | — |
| **IMAP 连接失败** | Fail-closed: 返回 500 + 释放分布式锁 | 不释放锁会阻塞用户 180s | — |
| **Auth token 刷新失败** | Fail-closed: 返回 401 | 不允许无 auth 的操作 | — |
| **Rate limit 达到** | Fail-closed: 返回 429 | 不允许超限操作 | — |
| **MCP 工具执行失败** | 返回 isError=true + 错误消息给 AI | AI 据此决定是否重试; 不影响 buddy_state | — |
| **Variable reward 失败** | 降级为 basic tier (bonusTokens=0) | 不撒谎 "GOLDEN SEEING! +20 tokens" 但 DB 没加 | — |
| **Invitation reward 失败** | referee 正常获奖, referrer 写 health_events 审计记录 | 不阻塞 referee 的正常流程; referrer 可后续重试 | — |
| **Dream fund redistribution 失败** | logger.error + 写 health_events 审计记录 | 金额可能丢失, 必须让 ops 能发现 | — |
| **Gacha count API 失败** | Fail-closed: 假设额度已满, 禁用 gacha | 防 airplane mode exploit | demo 模式用 localStorage (无 server, 无法 fail-closed) |
| **Challenge count refund 失败** | 返回不同文案 (不撒谎 "refunded") | 用户知道需要联系 support | — |
| **Realtime 连接断开** | 静默降级: 客户端用 polling fallback | Realtime 是优化, 不是必需 | — |
| **Background refetch 失败** | 静默降级: 保留旧数据 | 旧数据优于无数据 | — |

## 代码模式

### Fail-closed 模式
```typescript
try {
  const result = await supabase.from('table').select('*');
  if (result.error) {
    logger.error('[Context] DB error:', result.error.message);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
  // ... use result.data
} catch (err) {
  logger.error('[Context] Unexpected error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

### Fail-open 模式 (仅限明确标注例外)
```typescript
try {
  const result = await supabase.from('table').select('*');
  if (result.error) {
    logger.error('[Context] DB error, using cached data:', result.error.message);
    return cachedData; // safe to ignore: cached data is from <5min ago
  }
} catch (err) {
  // safe to ignore: background refetch, old data is better than no data
  logger.warn('[Context] Background refetch failed:', err);
}
```

### 审计记录模式 (失败但不阻塞主流程)
```typescript
try {
  await applyBuddyStateDelta(userId, { tokenDelta: 50 });
} catch (err) {
  logger.error('[Context] Reward failed — writing audit record:', err);
  try {
    await supabase.from('health_events').insert({
      user_id: userId,
      event_type: 'invitation_reward_failed',
      description: 'Reward failed: ...',
      // ... metadata with retry info
    });
  } catch (auditErr) {
    logger.error('[Context] CRITICAL: Audit record also failed:', auditErr);
  }
}
```

## 禁止的模式

1. ❌ `catch {}` 或 `catch { logger.warn(...) }` + 返回成功 — 静默吞错
2. ❌ `catch { logger.warn(...); return null; }` — null 让调用方困惑
3. ❌ `as any` 绕过类型检查后不验证 — 类型错误可能是数据损坏
4. ❌ Fallback 到已知有 bug 的旧路径 (除非 RPC code=42883 function not found)
5. ❌ 告诉用户操作成功但 DB 实际没写入 — 撒谎
