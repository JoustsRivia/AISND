#!/usr/bin/env node
// scripts/bundle-db-base.js
// 把「隔离层单一源」 cloudfunctions/_shared/dbBase.js 拷贝进每个云函数的
// helpers/ 目录，使各函数自包含、可独立部署（微信逐函数部署约束）。
//
// 用法：node scripts/bundle-db-base.js
// 约定：本文件由 npm pretest 与 uploadCloudFunction.sh 自动调用，无需手动执行。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'cloudfunctions', '_shared', 'dbBase.js');
const CLOUD = path.join(ROOT, 'cloudfunctions');

if (!fs.existsSync(SRC)) {
  console.error('❌ 未找到单一源文件：', SRC);
  process.exit(1);
}
const src = fs.readFileSync(SRC, 'utf8');

let n = 0;
for (const fn of fs.readdirSync(CLOUD).sort()) {
  const helpersDir = path.join(CLOUD, fn, 'helpers');
  if (!fs.existsSync(helpersDir) || !fs.statSync(helpersDir).isDirectory()) continue;
  const dest = path.join(helpersDir, 'dbBase.js');
  fs.writeFileSync(dest, src);
  n++;
}
console.log(`✅ 已把 _shared/dbBase.js 打包进 ${n} 个云函数的 helpers/（单一源 → 自包含部署）`);
