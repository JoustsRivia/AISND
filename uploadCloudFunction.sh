#!/usr/bin/env bash
# uploadCloudFunction.sh —— 云函数定点部署脚本（单函数）
#
# 用法：
#   bash uploadCloudFunction.sh <envId> <functionName> <projectPath>
#
# 示例：
#   bash uploadCloudFunction.sh prod-1f2a3b auth /path/to/project
#
# 说明：
#   - 仅部署单个云函数（--n <functionName>），不涉及目录通配，避免误部署脚手架。
#   - 脚手架 scaffolds/tpl 缺少 index.js，属不可运行的模板；传 tpl 将直接拒绝。
#   - INSTALL_PATH 指向微信云开发 CLI（tcb / cloudbase），可用环境变量覆盖。

set -euo pipefail

ENV_ID="${1:?用法: uploadCloudFunction.sh <envId> <functionName> <projectPath>}"
FUNC_NAME="${2:?缺少云函数名（functionName）}"
PROJECT_PATH="${3:?缺少项目路径（projectPath）}"

# 防误部署：脚手架模板 tpl 不可作为云函数推送
if [ "$FUNC_NAME" = "tpl" ]; then
  echo "❌ 拒绝部署脚手架模板 scaffolds/tpl（缺少 index.js，非可运行云函数）。" >&2
  echo "   如需新建云函数，请参考 scaffolds/tpl/README.md 复制并重命名。" >&2
  exit 1
fi

INSTALL_PATH="${INSTALL_PATH:-tcb}"

# 部署前：把「隔离层单一源」 shared/dbBase.js 打包进本函数 helpers/，
# 保证逐函数独立部署时各函数自包含、可运行（微信云函数无法跨函数 require 共享文件）。
if [ -f scripts/bundle-db-base.js ]; then
  node scripts/bundle-db-base.js >/dev/null 2>&1 || echo "⚠️ 隔离层打包跳过（无 scripts/bundle-db-base.js）"
fi

"$INSTALL_PATH" cloud functions deploy --e "$ENV_ID" --n "$FUNC_NAME" --r --project "$PROJECT_PATH"
