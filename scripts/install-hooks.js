#!/usr/bin/env node
// scripts/install-hooks.js
// 免 husky 的极简 git pre-commit 钩子安装器。
// 在提交前运行：helpers 注释规范校验 + 隔离层单一源校验，拦截回归。
//
// 用法：node scripts/install-hooks.js   （开发期执行一次）

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const hooksDir = path.join(ROOT, '.git', 'hooks');
if (!fs.existsSync(hooksDir)) {
  console.error('❌ 未找到 .git/hooks，请确认在 git 仓库根目录运行。');
  process.exit(1);
}
const hookPath = path.join(hooksDir, 'pre-commit');
const content = `#!/bin/sh
# 自动安装（scripts/install-hooks.js）—— 提交前质量卡点
set -e
cd "$(git rev-parse --show-toplevel)"
echo "🔍 pre-commit: helpers 注释规范 + 隔离层单一源校验"
node scripts/helper-comments.js
node scripts/check-db-base.js
`;
fs.writeFileSync(hookPath, content);
fs.chmodSync(hookPath, 0o755);
console.log('✅ 已安装 .git/hooks/pre-commit（helpers 注释 + dbBase 单一源卡点）');
console.log('   如需跳过：git commit --no-verify');
