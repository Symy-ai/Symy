/**
 * chat-endpoint — chat 端点选择的唯一真源 (single source of truth)
 *
 * 🔧 P0 fix (demo retry 死循环): guest (demo) 模式两条请求路径必须同源选端点。
 *   - sendMessage 主路径: parts/send-message-request.ts
 *   - retryAiResponse   : ../retry-ai-response.ts
 *   修复前 retry 路径硬编码 '/api/chat' (登录端点) → guest 无 session →
 *   route.ts userAgentId 为空 → 503 "AI is still initializing" → aiError 气泡 →
 *   再点重试永远 503 (demo 用户体验死循环)。故两处均改为读本 helper, 杜绝再次漂移。
 *
 * 语义不变 (与修复前 sendMessage 的 isDemo 三元一致):
 *   isDemo (guest/未登录) → 匿名端点 (服务端按 daily 额度 + userAgentId 计数)
 *   登录态              → 登录端点 (按 user id 计费)
 */

export function resolveChatEndpoint(isDemo: boolean): "/api/chat/anonymous" | "/api/chat" {
  return isDemo ? "/api/chat/anonymous" : "/api/chat";
}
