// 第19刀，自 route.ts:122-127 纯机械搬移
// （最后一条 user 消息提取 + 空内容 400 门 — JSON body 解析/校验在 parts/chat-validation.ts）
export type ExtractedUserMessage =
  | { ok: true; userContent: string }
  | { ok: false; response: Response };

export function extractUserMessage(
  safeMessages: ReadonlyArray<{ role: string; content: string }>,
): ExtractedUserMessage {
  const lastUserMsg = safeMessages.filter((m: { role: string }) => m.role === 'user').pop();
  const userContent = lastUserMsg?.content || safeMessages[safeMessages.length - 1]?.content || '';

  if (!userContent.trim()) {
    return { ok: false, response: Response.json({ error: 'Message content cannot be empty' }, { status: 400 }) };
  }
  return { ok: true, userContent };
}
