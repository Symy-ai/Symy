import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";
import symyPlugin from "./tools/eslint-rules/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  // 🔧 Round 101: Custom architectural guardrail rules.
  // These rules prevent the bug classes identified in the Round 101 audit:
  //   F1: race condition in async callbacks → no-async-callback-mutation
  //   F2: hooks firing API calls before auth ready → no-raw-fetch-in-use-effect, require-auth-gate-on-api-query
  //   F3: optimistic concurrency 409 conflicts → no-put-state-endpoints
  //   F8: swallowed errors → no-warn-only-catch
  // All rules are "warn" level initially — promote to "error" after fixing existing violations.
  plugins: { symy: symyPlugin },
  rules: {
    "symy/no-raw-fetch-in-use-effect": "warn",
    "symy/require-auth-gate-on-api-query": "warn",
    "symy/no-async-callback-mutation": "warn",
    "symy/no-put-state-endpoints": "warn",
    "symy/no-warn-only-catch": "warn",
    "symy/require-json-helper-in-authenticated-routes": "warn",
  },
}, {
  // 🔧 Round 91: Don't warn about unused eslint-disable directives.
  //    Some directives are for React 19 preview rules that are currently off.
  //    Keeping the directives preserves documentation for when rules are re-enabled.
  linterOptions: {
    reportUnusedDisableDirectives: "off",
  },
  rules: {
    // 🔧 架构优化 Round 69 (Finding 1): 渐进式开启关键 ESLint 规则
    // 已开启的规则 (warn 级别, 不阻塞 build):
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
    "no-unused-vars": "off", // TS 版本接管
    "prefer-const": "warn",

    // 🔧 ARCH fix (Round 58): 开启零成本安全规则 (不会产生 false positive)
    "no-unreachable": "error",       // 死代码, 0 false positive
    "no-fallthrough": "error",       // switch 漏 break, 0 false positive
    "no-case-declarations": "warn",  // switch 内 let 需要 block
    "no-empty": ["warn", { "allowEmptyCatch": true }], // 允许 catch {} 但 warn 空 block
    "@typescript-eslint/prefer-as-const": "warn",  // `as 'foo'` → `'foo' as const`

    // 🔧 Round 91: Turned off — `!` is a TypeScript feature, safer than `as any`.
    //    59 warnings were all in XState code where types are known non-null at runtime
    //    but TypeScript can't infer across assign() boundaries. Using `!` is the
    //    pragmatic choice documented in architecture-debt-policy.md.
    "@typescript-eslint/no-non-null-assertion": "off",
    // 🔧 Round 91: Turned off — SDK wrappers (Letta, ZAI) have untyped APIs,
    //    XState typedAssign needs `any` for type erasure. 22 warnings were all
    //    in SDK wrapper code or test files where `any` is appropriate.
    "@typescript-eslint/no-explicit-any": "off",
    // "no-unused-disable-directive": "error",  // 🔧 Round 73: disabled — rule not available in ESLint 9.39 flat config
    "no-debugger": "error",  // Round 69: 生产代码不允许 debugger
    "no-console": ["warn", { allow: ["warn", "error"] }],  // Round 69: 允许 warn/error, 禁止 log/info

    // React rules
    "react-hooks/exhaustive-deps": "warn",  // Round 69: 开启 warn (最重要 React 规则)
    "react-hooks/purity": "off",
    "react-hooks/preserve-manual-memoization": "off",
    // 🔧 Round 91: React 19 compiler preview rules — turned off due to high false positive rate.
    //    These rules flag legitimate patterns (ref.current = value in render for stable callbacks,
    //    prop→state sync in effects). The codebase uses eslint-disable for known cases.
    //    Turning off avoids 110+ false positive warnings that obscure real issues.
    //    When React 19 compiler stabilizes, re-enable and fix remaining cases.
    "react-hooks/refs": "off",
    "react-hooks/immutability": "off",
    "react-hooks/set-state-in-effect": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "no-irregular-whitespace": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-useless-escape": "off",

    // 🔧 Round 120 audit fix (AUDIT-4): 添加零成本安全规则 (0 existing violations)
    //    这些规则不产生 false positive, 纯 bug 预防
    "eqeqeq": ["error", "always", { "null": "ignore" }],  // 严格相等 (null/undefined 允许 ==)
    "no-var": "error",                                     // 禁止 var, 强制 let/const
    "no-return-await": "warn",                             // return await 多余 (除非 try/catch)
    "require-await": "warn",                               // async 无 await (可能漏写)
    "no-throw-literal": "error",                           // throw 必须抛 Error 对象, 不抛字符串
    "no-implicit-globals": "error",                        // 禁止隐式全局变量
    "no-self-assign": "error",                             // x = x (自我赋值)
    "no-self-compare": "error",                            // x === x (永真, 可能笔误)
    "no-unused-private-class-members": "error",            // 私有类成员未使用
    "no-useless-rename": "warn",                           // import {a as a} → import {a}
    "no-duplicate-imports": "warn",                        // 重复 import 同模块
  },
}, {
  // 🔧 架构债: scripts/ 和 doc/PPT_make/ 是 Node.js 脚本（非 src 应用代码），
  // 用 CommonJS require() 是合理的，不强制改 ESM
  files: ["scripts/**", "doc/PPT_make/scripts/**"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "examples/**", "skills", "public/**"]
}];

export default eslintConfig;
