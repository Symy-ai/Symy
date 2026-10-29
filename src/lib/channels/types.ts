import type { NextRequest } from 'next/server';

// 渠道接口保持平台无关：webhook 与回合核心只依赖这里的稳定契约。
export type PlatformId = 'telegram' | 'wechat_mp' | 'wechat_wecom';

export interface VerifyResult {
  ok: boolean;
  /** 微信 GET echostr 验证: 验过即需原样回显 */
  echoResponse?: string;
  reason?: 'bad_signature' | 'missing_header';
}

export interface InboundMessage {
  platform: PlatformId;
  platformUserId: string; // TG from.id / 微信 openid
  chatRef: string; // 回复目标: TG chat_id / 微信 openid
  text: string; // MVP 仅文本
  dedupId: string; // TG update_id / 微信 MsgId — 重放去重键
  languageHint?: string; // TG from.language_code ('zh-CN' → locale)
  kind: 'text' | 'command_start' | 'command_start_payload' | 'unsupported';
  startPayload?: string;
}

export interface ChannelAdapter {
  platform: PlatformId;
  capabilities: { asyncPush: boolean }; // 能否"事后主动推送" — 见 §5 微信约束
  verify(req: NextRequest, rawBody: string): Promise<VerifyResult>;
  parse(req: NextRequest, rawBody: string): Promise<InboundMessage[]>;
  /** 异步回复: 单条终稿文本; 分片/转义/429 重试都在实现内 */
  sendMessage(chatRef: string, text: string, opts?: { locale?: 'zh' | 'en' }): Promise<{ ok: boolean; error?: string }>;
  sendTyping?(chatRef: string): Promise<void>;
}
