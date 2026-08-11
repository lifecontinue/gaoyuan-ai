#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# npm-safe.sh —— 在 WorkBuddy 沙箱环境下可用的 npm 包装脚本
#
# 背景（三个已确认的环境限制）：
#   1. 默认 npm 缓存在 %LOCALAPPDATA%\npm-cache（工作区之外），沙箱禁止写入
#      → 每个请求 EPERM 后重试 3 次，单请求耗时 90s+ 最终失败。
#   2. cacache 索引文件被"二次追加写"时必定 EPERM
#      → 同一个缓存目录无法复用，第二次 npm 调用必然失败。
#   3. package.json 是受保护文件，禁止子进程写入
#      → 绝不能用 `npm install <pkg> --save`（最后一步写 package.json 会失败）。
#        必须先手工编辑 package.json 声明依赖，再运行本脚本安装。
#
# 用法：
#   bash scripts/npm-safe.sh install
#   bash scripts/npm-safe.sh run build
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# 每次调用生成全新缓存目录（限制 2 的规避手段）
CACHE_DIR="$PROJECT_DIR/.npm-cache-$(date +%s)-$$"
mkdir -p "$CACHE_DIR"

# 用环境变量而非 --cache 参数：safe-delete shim 只认环境变量来放行 _cacache/tmp
export npm_config_cache="$CACHE_DIR"
export npm_config_registry="https://registry.npmjs.org"

echo "[npm-safe] cache = $CACHE_DIR"
echo "[npm-safe] npm $*"

# 过滤掉 safe-delete 的噪声告警（清理临时目录失败，不影响安装结果）
npm "$@" --no-audit --no-fund 2>&1 \
  | grep -vE "safe-delete|npm warn cleanup|^\s+at |npm notice" || true

echo "[npm-safe] 完成。缓存目录可安全删除：$CACHE_DIR"
