/**
 * Gmail OAuth 配置
 * 
 * 需要在 Google Cloud Console 创建 OAuth 2.0 凭据:
 * 1. https://console.cloud.google.com/apis/credentials
 * 2. 创建 OAuth 2.0 Client ID (Web application)
 * 3. 添加 Authorized redirect URIs:
 *    - https://symy.ai/api/email/callback
 *    - https://we-me-mvp.vercel.app/api/email/callback
 *    - https://we-me.pages.dev/api/email/callback
 *    - http://localhost:3000/api/email/callback
 * 4. 启用 Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com
 * 
 * 然后把 Client ID 和 Client Secret 填入 .env.local 或 Vercel 环境变量
 * 
 * 注意：redirectUri 由 API 路由动态从请求 origin 构建，
 * 但你也可以通过 GOOGLE_REDIRECT_URI 环境变量覆盖
 */

export const GMAIL_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Gmail API 只需要 readonly 权限
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  // OAuth callback 地址 — 如果不设置，API 路由会从请求 origin 动态构建
  redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
};

export function isGmailConfigured(): boolean {
  return !!(GMAIL_OAUTH_CONFIG.clientId && GMAIL_OAUTH_CONFIG.clientSecret);
}
