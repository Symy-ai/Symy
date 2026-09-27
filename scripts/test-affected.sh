#!/usr/bin/env bash
# test-affected.sh — 「受影响域快测」通道: 改动文件 → 关联测试文件 → npx vitest run
#
# 用法:
#   scripts/test-affected.sh            # 缺省 = working tree 改动
#   scripts/test-affected.sh <commit>   # 某 commit 相对其第一父的改动
#   --diff <文件...>                    # 手工喂文件列表(冒烟/调试, 走同一映射段)
#   --map-only                         # 只出 AFFECTED 列表, 不跑 vitest
#
# 退出码:
#   0  = 映射到 ≥1 个测试文件且 vitest 绿
#   *  = vitest 自身的退出码(测试红/脚本错原样透出, 不吞)
#   3  = 映射为空 → 打印 "AFFECTED=none → fallback full", 由调用方决定跑全量
#   2  = 用法错 / 依赖缺失(git、npx 不可用)
#
# 纯 bash + git + grep, 零新依赖。映射规则保守(宁可多跑不漏测), 见下面 map_one_file()。
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  echo "test-affected: not inside a git repository" >&2
  exit 2
fi
cd "$REPO_ROOT" || exit 2

# ── 配置 ───────────────────────────────────────────────────────────────
# 守卫类(读源码/目录做断言)的测试: 改任何 src/**.ts(x) 都可能让它红, 永远入选。
GUARD_TESTS=(
  "src/lib/__tests__/architecture-guards.test.ts"
  "src/lib/__tests__/guard-ledger.test.ts"
  "src/i18n/messages/__tests__/defaultValue-guard.test.ts"
  "src/features/butterfly/hooks/session/__tests__/event-contracts.test.ts"
  "src/components/__tests__/daily-ritual-guardian.test.tsx"
)
# 仓级/构建配置: 一改就可能全局翻红, 永远入选。
ALWAYS_TESTS=(
  "vitest.config.ts"
  "src/test/setup.ts"
  "tsconfig.json"
  "package.json"
)

LOG="${TEST_AFFECTED_LOG:-/tmp/test-affected-map.log}"   # 调试用: 逐文件命中原因
MAP_ONLY=0
# 哪些 source 扩展名会走「模块名 grep」映射; .css/.json/.md 之类不进 grep 扇出
SOURCE_EXT_RE='\.(ts|tsx|js|jsx|mjs|cjs)$'
TEST_EXT_RE='\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$'
INDIRECT_EXT_RE='\.(css|scss|json|md|mdx)$'            # 由守卫/消费者测试兜住

WORK="$(mktemp -d "${TMPDIR:-/tmp}/test-affected.XXXXXX")" || exit 2
trap 'rm -rf "$WORK"' EXIT
AFFECTED="$WORK/affected.txt"
: > "$AFFECTED"
: > "$LOG"

die() { echo "test-affected: $*" >&2; exit 2; }

# ── 参数解析 ───────────────────────────────────────────────────────────
# 先剥标志, 再取位置参数(否则 `--map-only --diff a b` 会只看到 --map-only 而丢掉 --diff)。
CHANGED_FILE_LIST=""
CHANGED_LABEL=""
POSITIONALS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --map-only) MAP_ONLY=1 ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --diff)
      shift
      [ "$#" -gt 0 ] || die "--diff needs at least one file path"
      printf '%s\n' "$@" > "$WORK/changed.txt"
      CHANGED_FILE_LIST="$(cat "$WORK/changed.txt")"
      CHANGED_LABEL="manual --diff ($# file(s))"
      break
      ;;
    -*) die "unknown flag: $1" ;;
    *)  POSITIONALS+=("$1") ;;
  esac
  shift
done

if [ -z "$CHANGED_LABEL" ]; then
  case "${#POSITIONALS[@]}" in
    0)
      CHANGED_FILE_LIST="$(git diff --name-only HEAD || true)"   # working tree
      CHANGED_LABEL="working tree (git diff --name-only HEAD)"
      ;;
    1)
      SHA="${POSITIONALS[0]}"
      git rev-parse --verify --quiet "${SHA}^{commit}" >/dev/null \
        || die "not a commit: $SHA"
      # 单父取父, 合并提交取第一父(保守: 一个都不漏)
      PARENT="$(git rev-parse --verify --quiet "${SHA}^" || true)"
      if [ -n "$PARENT" ]; then
        CHANGED_FILE_LIST="$(git diff --name-only "$PARENT" "$SHA" || true)"
        CHANGED_LABEL="commit $SHA (git diff --name-only ${SHA}^ ${SHA})"
      else
        CHANGED_FILE_LIST="$(git show --name-only --pretty=format: "$SHA" 2>/dev/null \
          | grep -v '^$' || true)"
        CHANGED_LABEL="commit $SHA (root commit, git show)"
      fi
      ;;
    *)
      die "expected at most 1 commit, got ${#POSITIONALS[@]}: ${POSITIONALS[*]}"
      ;;
  esac
fi

if [ -z "${CHANGED_FILE_LIST//[[:space:]]/}" ]; then
  echo "CHANGED=none (no files changed in: $CHANGED_LABEL)"
  echo "AFFECTED=none → fallback full"
  exit 3
fi

# ── 测试文件清单: git ls-files 限定候选集, 自然排除 node_modules/.next ──
TESTS_FILE="$WORK/tests.txt"
git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' \
  'src/**/*.spec.ts' 'src/**/*.spec.tsx' \
  'src/*.test.ts' 'src/*.test.tsx' 'src/*.spec.ts' 'src/*.spec.tsx' \
  | LC_ALL=C sort -u > "$TESTS_FILE"
if [ ! -s "$TESTS_FILE" ]; then
  die "no tracked test files under src/ — cannot map"
fi

# ── 单文件映射 ─────────────────────────────────────────────────────────
# 收集模块引用: 覆盖 from '@/lib/x' | from '../x' | from './x' | import('x') | require('x')
collect_refs() {
  local needle="$1" candidate
  while IFS= read -r candidate; do
    grep -F -e "from '$needle'" -e "from \"$needle\"" \
            -e "import('$needle')" -e "require('$needle')" \
            -e "from \"$needle"  -e "from '$needle" \
            -- "$candidate" 2>/dev/null && true
  done < "$TESTS_FILE" >> "$WORK/refs.txt"
}

map_one_file() {
  local changed="$1"
  local dir base name_ stem
  local -a modules=()

  case "$changed" in
    *.test.ts|*.test.tsx|*.test.js|*.test.jsx|*.test.mjs|*.test.cjs|\
    *.spec.ts|*.spec.tsx|*.spec.js|*.spec.jsx|*.spec.mjs|*.spec.cjs)
      # a) 测试文件自己被改 → 直接入选
      add "$changed" "test-file-changed"
      return 0
      ;;
  esac

  # 仓级配置 / 守卫测试 → 永远入选
  local cfg
  for cfg in "${ALWAYS_TESTS[@]}"; do
    [ "$changed" = "$cfg" ] && add "$cfg" "repo-config-changed"
  done
  local g
  for g in "${GUARD_TESTS[@]}"; do
    [ -f "$g" ] && add "$g" "repo-wide-guard"
  done

  case "$changed" in
    src/*) ;;
    *) return 0 ;;                     # src/ 之外的改动(tools/ e2e/ scripts/ doc/ …)不参与
  esac

  [[ "$changed" =~ $SOURCE_EXT_RE ]] || return 0

  dir="$(dirname "$changed")"
  base="$(basename "$changed")"
  name_="${base%.*}"                    # platform-aggregate
  stem="$(basename "$name_")"           # 去掉 .server 等后缀前的粗粒度兜底
  dirbase="$(basename "$dir")"
  parent="$(dirname "$dir")"
  parentbase="$(basename "$parent")"

  # b) 同目录同基名: src/foo/bar.ts → src/foo/bar.test.ts
  [ -f "$dir/$name_.test.ts" ]   && add "$dir/$name_.test.ts"   "sibling:$name_.test.ts"
  [ -f "$dir/$name_.test.tsx" ]  && add "$dir/$name_.test.tsx"  "sibling:$name_.test.tsx"
  [ -f "$dir/$name_.spec.ts" ]   && add "$dir/$name_.spec.ts"   "sibling:$name_.spec.ts"
  [ -f "$dir/$name_.spec.tsx" ]  && add "$dir/$name_.spec.tsx"  "sibling:$name_.spec.tsx"

  # b) __tests__ 目录: src/foo/bar.ts → src/foo/__tests__/bar.test.ts
  [ -f "$dir/__tests__/$name_.test.ts" ]  && add "$dir/__tests__/$name_.test.ts"  "in-dir-tests:$name_.test.ts"
  [ -f "$dir/__tests__/$name_.test.tsx" ] && add "$dir/__tests__/$name_.test.tsx" "in-dir-tests:$name_.test.tsx"

  # c) 消费者(引用扇出): 任何测试里引用了这个模块就入选 —— 覆盖 app/**/page.tsx 与所有组件。
  #    指针串只取「被引用侧」后缀(from 'X' 收在 X), 因此 `./x` / `../x` / `@/x` 只需一条 `./x`
  #    就能全部命中; 仓内真用的写法: 相对路径、`@/` 别名(见 vitest.config.ts)、动态 import/require。
  #    对 @/ 额外补 src-根相对串(`@/lib/x` ⇔ `src/lib/x`), 否则别名的 import 找不到。
  local alias_depth="$(( ${#dir} - 3 ))"   # dir=src/lib → depth 0; dir=src/lib/email → depth 1
  : > "$WORK/needles.txt"
  {
    printf './%s\n' "$name_"
    if [ "$stem" != "$name_" ]; then printf './%s\n' "$stem"; fi
    if [ "${dir#src/}" != "$dir" ]; then
      printf '%s\n' "src/${dir#src/}/$name_"          # @/lib/guard-rank ⇔ src/lib/guard-rank
      [ "$stem" != "$name_" ] && printf 'src/%s/%s\n' "${dir#src/}" "$stem"
    fi
    # 源码扫描型测试(readFileSync/join(cwd,'x')/readdirSync)不会 import 被读的文件,
    # 拿仓内路径 + 文件名字面量兜住(如 readSrc('src','components','buddy','dream-fund-editor.tsx'))。
    printf '%s\n' "$changed"                        # 'src/components/daily-ritual-overlay.tsx'
    printf '%s\n' "$dir/$base"                      # 'components/daily-ritual-overlay.tsx'
    if [ "${dir#src/}" != "$dir" ]; then
      printf '%s/%s\n' "${dir#src/}" "$base"         # 'components/daily-ritual-overlay.tsx'
    fi
    printf '%s\n' "$base"                            # 'daily-ritual-overlay.tsx'
    printf './%s/\n' "$name_"                        # 目录字面量 './butterfly/…'
  } >> "$WORK/needles.txt"
  [ "$alias_depth" -gt 0 ] && printf 'src/%s/\n' "$name_" >> "$WORK/needles.txt"

  local needle
  while IFS= read -r needle; do
    [ -n "$needle" ] || continue
    collect_refs "$needle"          # 命中文件名逐行写进 $WORK/refs.txt
  done < "$WORK/needles.txt"

  if [ -s "$WORK/refs.txt" ]; then
    LC_ALL=C sort -u "$WORK/refs.txt" | while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      add "$hit" "refs:$changed"
    done
  fi

  return 0
}

add() {  # add <test-file> <reason>
  printf '%s\t%s\n' "$1" "$2" >> "$AFFECTED"
}

# ── 主循环 ─────────────────────────────────────────────────────────────
CHANGED_COUNT=0
SKIPPED=0
while IFS= read -r changed; do
  [ -n "$changed" ] || continue
  case "$changed" in
    src/*|vitest.config.ts|tsconfig.json|package.json) ;;
    *) SKIPPED=$((SKIPPED + 1)); continue ;;
  esac
  CHANGED_COUNT=$((CHANGED_COUNT + 1))
  map_one_file "$changed"
done <<< "$CHANGED_FILE_LIST"

if [ ! -s "$AFFECTED" ]; then
  echo "SOURCE: $CHANGED_LABEL"
  echo "CHANGED: $CHANGED_COUNT file(s) under src/ (+$SKIPPED outside src/ ignored)"
  echo "AFFECTED=none → fallback full"
  echo "exit 3 — caller decides: run the full suite (npm test)"
  exit 3
fi

# vitest 把非测试路径参数当「文件名过滤子串」用(不是指定文件), 混进去会静默吃掉用例。
# 例如 package.json 进列表 → 全部 601 个测试都不匹配 → 「0 tests」假绿。故必须筛成真测试文件。
mapfile -t AFFECTED_ALL < <(cut -f1 "$AFFECTED" | LC_ALL=C sort -u)
AFFECTED_LIST=()
DROPPED=()
for f in "${AFFECTED_ALL[@]}"; do
  if [[ "$f" =~ $TEST_EXT_RE ]] && [ -f "$f" ]; then
    AFFECTED_LIST+=("$f")
  else
    DROPPED+=("$f")
  fi
done
if [ "${#AFFECTED_LIST[@]}" -eq 0 ]; then
  echo "SOURCE: $CHANGED_LABEL"
  echo "CHANGED: $CHANGED_COUNT file(s) under src/ (+$SKIPPED outside src/ ignored)"
  echo "AFFECTED=none (only non-test files matched: ${DROPPED[*]}) → fallback full"
  exit 3
fi
mapfile -t AFFECTED_REASONS < <(cut -f1,2 "$AFFECTED" | LC_ALL=C sort -u | awk -F'\t' '
  { r[$2] = r[$2] (r[$2] ? "," : "") $1 } END { for (k in r) print k "\t" r[k] }' | LC_ALL=C sort)

echo "SOURCE: $CHANGED_LABEL"
echo "CHANGED: $CHANGED_COUNT file(s) under src/ (+$SKIPPED outside src/ ignored)"
echo "AFFECTED: ${#AFFECTED_LIST[@]}"
for f in "${AFFECTED_LIST[@]}"; do echo "  $f"; done
[ "${#DROPPED[@]}" -gt 0 ] && echo "  (not test files, dropped from vitest args: ${DROPPED[*]})"
echo "MAPPING: (reason → test files)"
for line in "${AFFECTED_REASONS[@]}"; do
  echo "  ${line%%$'\t'*} → ${line#*$'\t'}"
done
echo "MAP-LOG: $LOG"

if [ "$MAP_ONLY" -eq 1 ]; then
  echo "(map-only, vitest skipped)"
  exit 0
fi

# ── 跑 vitest(退出码原样透出) ────────────────────────────────────────────
command -v npx >/dev/null 2>&1 || die "npx not found on PATH"
npx vitest run "${AFFECTED_LIST[@]}"
status=$?
if [ "$status" -ne 0 ]; then
  echo "test-affected: vitest exited $status (affected set above)" >&2
  echo "hint: tests are green but mapping felt thin? widen GUARD_TESTS in $0" >&2
fi
exit "$status"
