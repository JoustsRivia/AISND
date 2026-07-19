#!/usr/bin/env node
// scripts/check-syntax.js
// 全量语法卡点：node --check 所有云函数（index.js + helpers/*）与前端页面（*.js）。
// 在单测之外补一道「能解析」的底线，CI 中作为强制门禁。

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const files = [];

function walk(dir, exts) {
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (e) { return; }
  for (const e of entries) {
    const p = path.join(dir, e);
    let st;
    try { st = fs.statSync(p); } catch (err) { continue; }
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === '.git') continue;
      walk(p, exts);
    } else if (exts.includes(path.extname(p))) {
      files.push(p);
    }
  }
}

walk(path.join(ROOT, 'cloudfunctions'), ['.js']);
walk(path.join(ROOT, 'pages'), ['.js']);
walk(path.join(ROOT, 'utils'), ['.js']);
walk(path.join(ROOT, 'components'), ['.js']);
for (const pkg of fs.readdirSync(ROOT)) {
  if (pkg.startsWith('pkg-') && fs.statSync(path.join(ROOT, pkg)).isDirectory()) {
    walk(path.join(ROOT, pkg), ['.js']);
  }
}

let bad = 0;
for (const f of files.sort()) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error('❌ 语法错误：', path.relative(ROOT, f));
    bad++;
  }
}
if (bad > 0) {
  console.error(`\n${bad} 个文件语法错误`);
  process.exit(1);
}
console.log(`✅ 语法检查通过：${files.length} 个 JS 文件`);
