import { withPayload } from '@payloadcms/next/withPayload';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  // NOTE: "standalone" output is for Docker/self-hosting only.
  // Vercel requires the default build output — do NOT set output: "standalone".
  // 🔧 2026-07-15 (ARCH-6 #24 部分修复):
  //   此前注释声称"已关闭"但实际值是 true — 注释与代码不一致的 bug
  //   修复尝试: 设为 false 让 Vercel CI 严格检查 TS 错误
  //   回退原因: next build 的 TS check 步骤在 4GB 环境下 OOM (TypeScript checker 内存消耗大)
  //   折中方案: 保持 ignoreBuildErrors=true (build 不卡 TS), 但:
  //     1. pre-commit hook 已运行 tsc --noEmit (本地拦截)
  //     2. CI workflow 已有 tsc --noEmit 步骤 (ci-checks.yml, 2026-09 确认)
  //   这样 build 能成功部署, TS 错误仍被 pre-commit + CI 拦截
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  // 🔐 v14-G 安全头 (2026-10-11 R480): CSP 以 Report-Only 先行观察一周再转强制;
  // 其余硬头立即生效。Vercel 平台已自动给 HSTS, 此处不重复。
  // eslint-disable-next-line require-await -- Next.js headers() API 要求 async 签名
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js 内联引导脚本 + styled-jsx 需要 unsafe-inline (无 nonce 基建)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us.i.posthog.com https://*.posthog.com https://browser.sentry-cdn.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://*.ingest.sentry.io https://*.sentry.io",
      // frames: 无第三方嵌入需求
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy-Report-Only', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
  // 🔧 头像压缩 fix: sharp 有 native binary, 必须设为 serverExternalPackages
  serverExternalPackages: ['sharp'],
  // 🔧 2026-07-15 (ARCH-11 #22): next/image for avatar + butterfly illustrations
  images: {
    remotePatterns: [
      // Supabase Storage (avatars, illustrations)
      {
        protocol: 'https' as const,
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  redirects() {
    return [
      { source: '/blog', destination: '/en/blog', permanent: true },
      { source: '/blog/:path*', destination: '/en/blog/:path*', permanent: true },
    ];
  },
  // 🤝 契约签署系统 (Symy-ai/covenant 独立项目, 2026-09-21):
  //    /covenant 代理到 covenant Vercel 项目（签名系统），须用 beforeFiles 盖过
  //    主站自有的 [locale]/covenant 品牌页；品牌页仍走 /en/covenant、/zh/covenant。
  rewrites() {
    return {
      beforeFiles: [
        { source: '/covenant', destination: 'https://covenant-blond-gamma.vercel.app/' },
        { source: '/covenant/:path*', destination: 'https://covenant-blond-gamma.vercel.app/:path*' },
      ],
    };
  },
};

export default withPayload(
  withBundleAnalyzer(
    withSentryConfig(withNextIntl(nextConfig), {
      // Only run Sentry webpack in production builds when DSN is set
      silent: true,

      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Only upload source maps if SENTRY_AUTH_TOKEN is set
      // (prevents build failures in environments without Sentry auth)
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },

      // 🔧 2026-07-15: Disable in dev to avoid noise
      disableLogger: process.env.NODE_ENV === 'development',
    }),
  ),
);
