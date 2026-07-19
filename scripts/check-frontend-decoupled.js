#!/usr/bin/env node
// scripts/check-frontend-decoupled.js
// 前端零直连自动化门禁（迭代 Item 7，把架构铁律①变成不可绕过的流水线卡点）：
//   扫描 pages/** 与 components/**（及全部前端 utils，除授权 transport 层）的 .js 源码，
//   禁止直接调用 wx.cloud.callFunction / wx.cloud.database / wx.cloud.uploadFile / wx.cloud.downloadFile
//   （统一入口只允许 utils/api.js 封装）；wx.cloud.init 仅允许出现在 app.js。
//   命中即退出码 1，阻断合并；零命中退出 0。
//
// 用法：node scripts/check-frontend-decoupled.js
// 退出码 1 = 存在前端直连；0 = 通过。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 允许直连 wx.cloud.* 的文件（授权 transport 层 / 云开发初始化引导）
const ALLOWED = new Set([
  path.join(ROOT, 'app.js'),
  path.join(ROOT, 'utils', 'api.js'),
]);

// 禁止的直连模式（前端统一入口铁律①）
const FORBIDDEN = /\bwx\.cloud\.(callFunction|database|uploadFile|downloadFile)\b/;
// wx.cloud.init 仅允许出现在 app.js（云开发初始化引导）
const INIT = /\bwx\.cloud\.init\b/;

const SKIP_DIRS = new Set(['node_modules', 'cloudfunctions', '.git', 'miniprogram_npm', 'scripts']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(e)) walk(p, out);
    } else if (path.extname(p) === '.js') {
      out.push(p);
    }
  }
}

const files = [];
walk(ROOT, files);

let bad = 0;
for (const f of files) {
  if (ALLOWED.has(f)) continue; // 授权 transport 层豁免
  let content;
  try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const rel = path.relative(ROOT, f);
  if (FORBIDDEN.test(content)) {
    console.error(`❌ 前端直连违规（${rel}）：禁止直接调用 wx.cloud.callFunction/database/uploadFile/downloadFile，请改用 utils/api.js`);
    bad++;
  }
  if (INIT.test(content)) {
    console.error(`❌ 初始化违规（${rel}）：wx.cloud.init 仅允许出现在 app.js`);
    bad++;
  }
}

if (bad > 0) {
  console.error(`\n发现 ${bad} 处前端直连违规，违反架构铁律①（前端统一入口）。`);
  process.exit(1);
}
console.log(`✅ 前端零直连校验通过：pages/、components/ 及前端 utils 均未直连 wx.cloud.*（统一入口仅 utils/api.js）。`);
process.exit(0);
