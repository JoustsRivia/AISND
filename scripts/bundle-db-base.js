#!/usr/bin/env node
// scripts/bundle-db-base.js
// 把「隔离层单一源」拷贝进每个云函数的 helpers/ 目录，使各函数自包含、可独立部署
// （微信逐函数部署约束，跨函数 require 共享文件会在运行时失败）。
//
// 当前打包三份单一源：
//   - shared/dbBase.js        → <fn>/helpers/dbBase.js        （数据能力隔离层）
//   - shared/userBase.js      → <fn>/helpers/userBase.js      （鉴权助手隔离层）
//   - shared/rateLimiter.js   → <fn>/helpers/rateLimiter.js  （限流中间件，R23）
//
// 用法：node scripts/bundle-db-base.js
// 约定：本文件由 npm pretest 与 uploadCloudFunction.sh 自动调用，无需手动执行。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const CLOUD = path.join(ROOT, 'cloudfunctions');

// [单一源文件, 目标文件名]
const SOURCES = [
  ['dbBase.js', 'dbBase.js'],
  ['userBase.js', 'userBase.js'],
  ['rateLimiter.js', 'rateLimiter.js'],
];

for (const [srcName, destName] of SOURCES) {
  const SRC = path.join(SHARED, srcName);
  if (!fs.existsSync(SRC)) {
    console.error('❌ 未找到单一源文件：', SRC);
    process.exit(1);
  }
}

let n = 0;
for (const fn of fs.readdirSync(CLOUD).sort()) {
  const helpersDir = path.join(CLOUD, fn, 'helpers');
  if (!fs.existsSync(helpersDir) || !fs.statSync(helpersDir).isDirectory()) continue;
  for (const [srcName, destName] of SOURCES) {
    const src = fs.readFileSync(path.join(SHARED, srcName), 'utf8');
    fs.writeFileSync(path.join(helpersDir, destName), src);
    n++;
  }
}
console.log(`✅ 已把隔离层单一源（dbBase.js + userBase.js + rateLimiter.js）打包进各云函数 helpers/，共 ${n} 份副本（单一源 → 自包含部署）`);
