#!/bin/bash
# 🔧 ARCH fix (Round 76): Pre-commit hook 设置脚本
# 🔧 Round 120 audit fix (AUDIT-4): 修复 --max-warnings=0 不可达问题
#
# 用法: bash scripts/setup-precommit.sh
# 或自动安装: package.json 的 "prepare" 脚本会调用此脚本
#
# 安装后, 每次 git commit 会自动运行:
# 1. TypeScript 类型检查 (tsc --noEmit) — 0 errors 要求
# 2. ESLint 检查 (staged 文件) — 0 errors 要求 (warnings 不阻塞)
#
# 如果失败, commit 被阻止, 开发人员必须修复后才能 commit。
# 跳过: git commit --no-verify (紧急情况)

set -e

HOOK_FILE=".git/hooks/pre-commit"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
set -e

echo "🔍 Running pre-commit checks..."

# TypeScript 类型检查
# 🔧 2026-07-21 audit fix (ADMIN-5 OOM): 默认 Node 堆 (~384MB) 不够 tsc 全量类型检查本项目
#    → "JavaScript heap out of memory" → commit 失败 → 开发者被迫 git commit --no-verify 绕过
#    (失去 lint 门禁)。根因修复: 给 tsc 提供与 package.json build 一致的 3072MB 堆。
echo "  → TypeScript type check..."
NODE_OPTIONS='--max-old-space-size=3072' npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript type check failed. Fix errors before committing."
  echo "   Skip with: git commit --no-verify"
  exit 1
fi

# ESLint 检查 (只检查 staged 文件)
# 🔧 Round 127: ESLint warnings 全部清零! 棘轮设为 0
# 🔧 2026-07-21 audit fix (CI gap): 旧代码 `| head -20` 在大 commit (>20 文件) 时
#   静默跳过第 20 个之后的 staged 文件, 留下 lint 漏洞。改用 xargs 批处理
#   (规避 Windows cmd 参数长度上限), 覆盖所有 staged 文件, 任一批失败即整体失败。
echo "  → ESLint check on staged files (max-warnings=0)..."
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED_FILES" ]; then
  echo "$STAGED_FILES" | xargs -r -n 20 npx eslint --max-warnings=0
  if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed (errors found). Fix errors before committing."
    echo "   Skip with: git commit --no-verify"
    exit 1
  fi
fi

echo "✅ Pre-commit checks passed!"
EOF

chmod +x "$HOOK_FILE"

echo "✅ Pre-commit hook installed at $HOOK_FILE"
echo "   Checks: TypeScript (0 errors) + ESLint (0 errors, warnings allowed)"
echo "   Skip: git commit --no-verify"
