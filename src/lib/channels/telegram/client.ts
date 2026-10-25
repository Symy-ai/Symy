import { logger } from '@/lib/logger';

const TELEGRAM_MESSAGE_LIMIT = 4000;

function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    const window = remaining.slice(0, TELEGRAM_MESSAGE_LIMIT + 1);
    const paragraphBoundary = window.indexOf('\n\n', 1);
    const lineBoundary = window.indexOf('\n', 1);
    const whitespaceBoundary = window.slice(0, TELEGRAM_MESSAGE_LIMIT).lastIndexOf(' ');
    const cut = paragraphBoundary > 0
      ? paragraphBoundary
      : lineBoundary > 0
        ? lineBoundary
        : whitespaceBoundary > 0
          ? whitespaceBoundary + 1
          : TELEGRAM_MESSAGE_LIMIT;
    const chunk = remaining.slice(0, cut);
    if (chunk.trim().length > 0) chunks.push(chunk);
    remaining = remaining.slice(cut).replace(/^\n\n/, '');
  }
  if (remaining.trim().length > 0) chunks.push(remaining);
  return chunks;
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/^\s*[-*+]\s+/.test(escaped)) return escaped.replace(/^(\s*)[-*+]\s+/, '$1· ');
      return escaped;
    })
    .join('\n')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/`{1,3}([^`]*?)`{1,3}/g, '$1');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/`{1,3}([^`]*?)`{1,3}/g, '$1');
}

function postMessage(chatRef: string, text: string, html: boolean): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatRef,
      text: html ? renderHtml(text) : stripMarkdown(text),
      ...(html ? { parse_mode: 'HTML' } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function sendChunk(chatRef: string, text: string): Promise<void> {
  let useHtml = true;
  let response = await postMessage(chatRef, text, useHtml);
  if (response.status === 400) {
    useHtml = false;
    response = await postMessage(chatRef, text, useHtml);
  }

  if (response.status === 429) {
    const payload = (await response.json().catch(() => ({}))) as { parameters?: { retry_after?: number } };
    const retryAfter = Number(payload.parameters?.retry_after);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      // cap 30s：路由 maxDuration=60，TG 回超大 retry_after 时不能顶穿执行时限。
      const waitSec = Math.min(retryAfter, 30);
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      response = await postMessage(chatRef, text, useHtml);
    }
  }

  if (!response.ok) throw new Error(`Telegram sendMessage failed with status ${response.status}`);
}

export async function sendTelegramMessage(
  chatRef: string,
  text: string,
  _opts?: { locale?: 'zh' | 'en' },
): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const chunk of splitMessage(text)) await sendChunk(chatRef, chunk);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Telegram send error';
    await logger.error('[Channel] send_fail platform=telegram', new Error(message));
    return { ok: false, error: message };
  }
}

export async function sendTelegramChatAction(chatRef: string): Promise<void> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatRef, action: 'typing' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) logger.debug('[Channel] typing_fail platform=telegram');
  } catch (error) {
    // safe to ignore: typing 指示是体验增强，不影响消息回合结果。
    logger.debug('[Channel] typing_fail platform=telegram', error);
  }
}
