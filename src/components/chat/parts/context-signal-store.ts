/**
 * context-signal-store — 弱信号会话纠正记录 (sessionStorage, batch61-b)
 *
 * 用户在信号词 chips 上点「不是因为这个」→ 词条 id 记入 sessionStorage:
 * 本会话内每次发消息随请求上行 (dismissedContextSignals), 服务端弱信号
 * detector 排除该词条 — 一次纠正, 本会话不再重复同信号。
 *
 * 设计红线:
 * - 只存词表 SSOT 词条 id (字符串), 不存消息内容/情绪/任何画像
 * - sessionStorage = 会话级: 关掉标签页即清空, 不跨设备不同步 (与「先等
 *   10 分钟」同一私密本地记录哲学)
 * - 读写全程 try/catch 静默降级 (隐私模式/禁 storage 时纠正只是不持久)
 */

const STORAGE_KEY = 'symy_context_signal_dismissed';

/** 读取会话内已纠正的词条 id (不可用/损坏 → 空数组) */
export function readDismissedContextSignals(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    // safe to ignore: session-scoped preference, unreadable storage just means no suppression
    return [];
  }
}

/** 记录一次纠正 (幂等; 已在册的词条不重复写) */
export function dismissContextSignal(entryId: string): void {
  if (!entryId) return;
  try {
    const current = readDismissedContextSignals();
    if (current.includes(entryId)) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...current, entryId]));
  } catch {
    // safe to ignore: session-scoped preference, unwritable storage just means no persistence
  }
}
