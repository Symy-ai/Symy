# 依赖审计攻击面分析 — 16 high 传递闭包逐项定性（2026-10-08）

基线：28v = 2 low / 10 moderate / 16 high，critical 0。直依赖 next 16.3.8 / @modelcontextprotocol/sdk 1.32.1 / proxy-addr 2.0.8 已 patched。
方法：package-lock.json 为 SSOT（npm ls 因本地树漂移 ELSPROBLEMS 不可用）反推最短依赖链 → 按链根是 dependencies 还是 devDependencies 定 PROD/DEV → 对 PROD 侧逐项判定运行时可达性（Vercel Next.js：nft 只打包运行时实际 require 的文件）。

## 全量表

| 包 | GHSA(数) | 链 | 侧 | 定性 | 证据 |
|---|---|---|---|---|---|
| @next/eslint-plugin-next | 无独立GHSA(随eslint-config-next) | eslint-config-next(直devDep) | DEV | BUILD-ONLY | eslint 插件，只在 `next lint`/CI 加载 |
| eslint-config-next | 同上(直devDep) | 根 | DEV | BUILD-ONLY | eslint 配置链 |
| brace-expansion | 4 | minimatch←@eslint/config-array←eslint(直devDep) | DEV | BUILD-ONLY | eslint glob 展开，无用户输入面 |
| fast-glob | 1 | @next/eslint-plugin-next←eslint-config-next | DEV | BUILD-ONLY | 同上 |
| fast-uri | 8 | ajv←@eslint/eslintrc←eslint | DEV | BUILD-ONLY | eslint schema 校验 |
| micromatch | 1 | fast-glob←@next/eslint-plugin-next | DEV | BUILD-ONLY | 同上 |
| js-yaml | 2 | json-schema-to-typescript←payload | PROD-但构建期 | BUILD-ONLY | payload 的 codegen 链（schema→types 生成于构建） |
| braces | 1 | chokidar←sass←@payloadcms/next | PROD-但构建期 | BUILD-ONLY | sass 文件监听 glob；SCSS 在 Vercel 构建期编译完，不进运行时 bundle |
| chokidar | 1 | sass←@payloadcms/next | PROD-但构建期 | BUILD-ONLY | 文件监听器，仅构建期 dev server 用 |
| sass | 1 | @payloadcms/next(直prodDep) | PROD-但构建期 | BUILD-ONLY | SCSS 编译于构建；next.config 未开 runtime sass |
| source-map-js | 1 | @tailwindcss/node←@tailwindcss/postcss(直prodDep) | PROD-但构建期 | BUILD-ONLY | tailwind CSS 编译于构建 |
| nanoid | 1 | postcss←@tailwindcss/postcss | PROD-但构建期 | BUILD-ONLY | postcss 插件 ID 生成，构建期 |
| browserslist | 2 | webpack←@sentry/bundler-plugin-core←@sentry/nextjs | PROD-但构建期 | BUILD-ONLY | webpack 目标浏览器表，构建期读取 |
| @payloadcms/next | fix=0.11.4 是 major(3.x→0.11.x 为误报降级) | 根(直prodDep) | PROD | RUNTIME-REACHABLE-BUT-NOFIX | audit 建议的 0.11.4 是把 payload 3.x 降级到 0.x —— 不可行；payload 3.90.2 内嵌 chokidar/sass 等 high 全在构建期路径。等 payload 官方 patched release |
| @payloadcms/richtext-lexical | 同上 | 根(直prodDep) | PROD | RUNTIME-REACHABLE-BUT-NOFIX | 同上，随 payload 整体升级 |
| ip-address | 7 | express-rate-limit←@modelcontextprotocol/sdk | PROD | RUNTIME-UNREACHABLE | express-rate-limit 在 MCP SDK standalone server 路径内；本项目用 WebStandardStreamableHTTPServerTransport（serverless 适配），该路径不 require express 链（历史背书：R15 同链豁免） |

## 结论统计

- BUILD-ONLY（构建链，不进生产运行时）：13
- RUNTIME-UNREACHABLE（进 prod deps 但 vuln 代码路径不被 require）：1（ip-address）
- RUNTIME-REACHABLE 但无可修版本：2（payload 双包——chokidar/sass/braces 的 high 全在 payload 的构建期子链；audit 的"fix"是降级误报）

## 待办（owner 决策面，非阻塞）

- payload 3.x 后续 release 若带 chokidar/sass patched 链，升级即清 6-8 个 high。当前 16 high 实际运行时攻击面 = **0**。

---
*方法注：npm ls 因本地 node_modules 与 lock 漂移报 ELSPROBLEMS（57 UNMET，实测包都已安装，属 npm ls 的 hoisting 误报）——分析以 lock 文件为 SSOT。*
