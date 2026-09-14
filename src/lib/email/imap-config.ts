/**
 * IMAP 邮箱配置
 *
 * 支持国内常用邮箱的 IMAP 直连（163.com、QQ Mail、Gmail 等）
 * 不需要 OAuth，直接使用授权码连接
 */

export interface IMAPProvider {
  name: string;
  host: string;
  port: number;
  tls: boolean;
  domains: string[];
}

export const IMAP_PROVIDERS: IMAPProvider[] = [
  {
    name: '163 Mail',
    host: 'imap.163.com',
    port: 993,
    tls: true,
    domains: ['163.com', '126.com', 'yeah.net'],
  },
  {
    name: 'QQ Mail',
    host: 'imap.qq.com',
    port: 993,
    tls: true,
    domains: ['qq.com', 'foxmail.com'],
  },
  {
    name: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    domains: ['gmail.com'],
  },
  {
    name: 'Outlook',
    host: 'outlook.office365.com',
    port: 993,
    tls: true,
    domains: ['outlook.com', 'hotmail.com', 'live.com'],
  },
  {
    name: 'Sina Mail',
    host: 'imap.mail.sina.com',
    port: 993,
    tls: true,
    domains: ['sina.com', 'sina.cn'],
  },
  {
    name: 'Sohu Mail',
    host: 'imap.sohu.com',
    port: 993,
    tls: true,
    domains: ['sohu.com'],
  },
];

/**
 * 根据邮箱地址自动识别 IMAP 服务器配置
 */
export function detectIMAPProvider(email: string): IMAPProvider | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  return IMAP_PROVIDERS.find((p) => p.domains.includes(domain)) || null;
}

/**
 * 验证邮箱地址格式
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
