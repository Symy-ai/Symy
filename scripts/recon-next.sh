#!/usr/bin/env bash
# R222 事故后根治版侦察: 写测试前硬闸 —— 目标已有测试文件则拒绝并退出非零
# 用法: bash recon-next.sh [路径]   (缺省扫 src/features src/components src/lib)
set -euo pipefail
TARGET="${1:-}"
if [ -n "$TARGET" ]; then
  # 单件模式: 硬闸检查
  DIR=$(dirname "$TARGET")
  BASE=$(basename "$TARGET")
  STEM="${BASE%.*}"
  EXT="${BASE##*.}"
  if [ -e "$DIR/__tests__/$STEM.test.$EXT" ]; then
    echo "⛔ 已有测试: $DIR/__tests__/$STEM.test.$EXT — 恢复/合并旧版, 禁覆盖 (R213/R222 事故铁律)" >&2
    exit 3
  fi
  echo "✅ $TARGET 无既有测试, 可写新测试到 $DIR/__tests__/$STEM.test.$EXT"
  exit 0
fi
# 队列模式: 列 55-105 行无测试件 (os.path.splitext 一次到位)
python3 - <<'PY'
import os
found=[]
for base in ['src/features','src/components','src/lib']:
    for root,dirs,files in os.walk(base):
        if '__tests__' in root or 'node_modules' in root: continue
        for f in files:
            stem,ext = os.path.splitext(f)
            if ext not in ('.ts','.tsx'): continue
            if os.path.exists(os.path.join(root,'__tests__',stem+'.test'+ext)): continue
            # 兜底: 同 stem 异扩展测试也算已测 (防 .ts 源配 .tsx 测试的错位漏判)
            if os.path.exists(os.path.join(root,'__tests__',stem+'.test.ts')) or os.path.exists(os.path.join(root,'__tests__',stem+'.test.tsx')): continue
            p=os.path.join(root,f)
            try: n=sum(1 for _ in open(p))
            except: continue
            if 55<=n<=105: found.append((n,p))
found.sort()
for n,p in found: print(n,p)
print('TOTAL', len(found))
PY
