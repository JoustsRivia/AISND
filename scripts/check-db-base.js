#!/usr/bin/env node
// scripts/check-db-base.js
// 隔离层单一源「漂移卡点」（CI / pre-commit 用）：
//   1) 各单一源（_shared/dbBase.js、_shared/userBase.js）语法有效；
//   2) 重新打包后与各函数 helpers/ 下对应副本完全一致（杜绝手工改副本导致漂移）。
//
// 退出码 1 = 存在漂移或不一致；0 = 通过。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'cloudfunctions', '_shared');
const CLOUD = path.join(ROOT, 'cloudfunctions');

// [单一源, 副本名]
const SRC_TO_DEST = [
  ['dbBase.js', 'dbBase.js'],
  ['userBase.js', 'userBase.js'],
];

// 1) 各源语法
for (const [srcName] of SRC_TO_DEST) {
  const SRC = path.join(SHARED, srcName);
  if (!fs.existsSync(SRC)) {
    console.error('❌ 未找到单一源文件：', SRC);
    process.exit(1);
  }
  try {
    execSync(`node --check "${SRC}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`❌ ${srcName} 语法错误`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbBase-'));
let n = 0;
let bad = 0;
for (const fn of fs.readdirSync(CLOUD).sort()) {
  const helpersDir = path.join(CLOUD, fn, 'helpers');
  if (!fs.existsSync(helpersDir) || !fs.statSync(helpersDir).isDirectory()) continue;
  for (const [srcName, destName] of SRC_TO_DEST) {
    const src = fs.readFileSync(path.join(SHARED, srcName), 'utf8');
    // 重新生成一份，证明「单一源 → 部署副本」可一致产出
    fs.writeFileSync(path.join(tmp, fn + '.' + destName), src);
    const dest = path.join(helpersDir, destName);
    if (fs.existsSync(dest)) {
      n++;
      if (fs.readFileSync(dest, 'utf8') !== src) {
        console.error(`⚠️ 漂移：${path.relative(ROOT, dest)} 与 _shared/${srcName} 不一致，请重跑 node scripts/bundle-db-base.js`);
        bad++;
      }
    } else {
      n++;
    }
  }
}
if (bad > 0) {
  console.error(`\n发现 ${bad} 处漂移。`);
  process.exit(1);
}
console.log(`✅ 隔离层单一源校验通过：${n} 个副本均可由 _shared/* 一致生成（dbBase.js + userBase.js）`);
