/**
 * resolveStoryLocale — 互动故事内容语言解析（batch73-c）
 *
 * profiles.locale 只在用户手动切语言时写入（i18n setLocale → /api/user/locale），
 * 浏览器检测进来的 zh 用户该列常为 NULL，仅靠它会让互动故事恒英文
 * （buildChapterStorySystemPrompt 非 'zh' 一律输出英文指令）。
 *
 * 优先级：请求体 UI locale（客户端实时语言）> profile.locale（服务端存档兜底）。
 */

export function resolveStoryLocale(
  requestLocale?: string,
  profileLocale?: string | null,
): string | undefined {
  return requestLocale || profileLocale || undefined;
}
