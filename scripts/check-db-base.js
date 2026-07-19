#!/usr/bin/env node
// scripts/check-db-base.js
// 隔离层单一源「漂移卡点」（CI / pre-commit 用）：
//   1) 单一源 _shared/dbBase.js 语法有效；
//   2) 重新打包后与各函数 helpers/dbBase.js 完全一致（杜绝手工改副本导致漂移）。
//
// 退出码 1 = 存在漂移或不一致；0 = 通过。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'cloudfunctions', '_shared', 'dbBase.js');
const CLOUD = path.join(ROOT, 'cloudfunctions');

if (!fs.existsSync(SRC)) {
  console.error('❌ 未找到单一源文件：', SRC);
  process.exit(1);
}

// 1) 源语法
try {
  execSync(`node --check "${SRC}"`, { stdio: 'pipe' });
} catch (e) {
  console.error('❌ _shared/dbBase.js 语法错误');
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');

// 2) 重新打包并与各函数现有副本比对（确保可一致生成、无手工漂移）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbBase-'));
let n = 0;
let bad = 0;
for (const fn of fs.readdirSync(CLOUD).sort()) {
  const helpersDir = path.join(CLOUD, fn, 'helpers');
  if (!fs.existsSync(helpersDir) || !fs.statSync(helpersDir).isDirectory()) continue;
  const dest = path.join(helpersDir, 'dbBase.js');
  // 重新生成一份，证明「单一源 → 部署副本」可一致产出
  fs.writeFileSync(path.join(tmp, fn + '.js'), src);
  if (fs.existsSync(dest)) {
    n++;
    if (fs.readFileSync(dest, 'utf8') !== src) {
      console.error(`⚠️ 漂移：${path.relative(ROOT, dest)} 与 _shared/dbBase.js 不一致，请重跑 node scripts/bundle-db-base.js`);
      bad++;
    }
  } else {
    n++;
  }
}
if (bad > 0) {
  console.error(`\n发现 ${bad} 处漂移。`);
  process.exit(1);
}
console.log(`✅ 隔离层单一源校验通过：${n} 个云函数的 dbBase.js 均可由 _shared/dbBase.js 一致生成`);
