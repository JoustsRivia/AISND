#!/usr/bin/env node
// scripts/validate-functions.js
// CI「构建产物」门禁（沙箱无云环境，仅能做静态 + 隔离层一致性校验）：
//   对每个可部署云函数（排除 _shared / _tests / tpl 脚手架）验证：
//     1) 结构完整：含 index.js 与 package.json（可被云函数 CLI 识别）；
//     2) 语法可解析：目录内全部 *.js 通过 node --check；
//     3) 隔离层自包含：helpers/ 下已生成 dbBase.js / userBase.js 且与 _shared/* 单一源一致
//        （先由 bundle-db-base.js 打包，再校验，杜绝「漏打包即部署」）。
//
// 用法：node scripts/validate-functions.js
// 退出码 1 = 存在不可部署的函数；0 = 全部通过。

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'cloudfunctions', '_shared');
const CLOUD = path.join(ROOT, 'cloudfunctions');

// 先打包隔离层（保证后续校验基于「将被部署」的真实产物）
try {
  execSync('node scripts/bundle-db-base.js', { stdio: 'pipe' });
} catch (e) {
  console.error('❌ 隔离层打包失败');
  process.exit(1);
}

// [单一源, 副本名]
const SRC_TO_DEST = [
  ['dbBase.js', 'dbBase.js'],
  ['userBase.js', 'userBase.js'],
];

const SKIP = new Set(['_shared', '_tests', 'tpl']); // tpl 为脚手架，禁止部署

let checked = 0;
let bad = 0;

for (const fn of fs.readdirSync(CLOUD).sort()) {
  const dir = path.join(CLOUD, fn);
  if (!fs.statSync(dir).isDirectory() || SKIP.has(fn)) continue;
  checked++;
  const issues = [];

  // 1) 结构完整
  if (!fs.existsSync(path.join(dir, 'index.js'))) issues.push('缺少 index.js');
  if (!fs.existsSync(path.join(dir, 'package.json'))) issues.push('缺少 package.json');

  // 2) 语法可解析（递归全部 *.js）
  const jsFiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d)) {
      const p = path.join(d, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (e !== 'node_modules') walk(p); }
      else if (path.extname(p) === '.js') jsFiles.push(p);
    }
  })(dir);
  for (const f of jsFiles) {
    try { execSync(`node --check "${f}"`, { stdio: 'pipe' }); }
    catch (e) { issues.push('语法错误: ' + path.relative(ROOT, f)); }
  }

  // 3) 隔离层自包含（dbBase.js / userBase.js 必须存在且与单一源一致）
  const helpersDir = path.join(dir, 'helpers');
  for (const [srcName, destName] of SRC_TO_DEST) {
    const src = fs.readFileSync(path.join(SHARED, srcName), 'utf8');
    const dest = path.join(helpersDir, destName);
    if (!fs.existsSync(dest)) { issues.push(`缺少隔离层副本 ${destName}`); continue; }
    if (fs.readFileSync(dest, 'utf8') !== src) issues.push(`隔离层漂移 ${destName}`);
  }

  if (issues.length) {
    bad++;
    console.error(`❌ ${fn}：`);
    issues.forEach((i) => console.error('   - ' + i));
  } else {
    console.log(`✅ ${fn}：可部署（index.js + package.json + 语法OK + 隔离层自包含）`);
  }
}

console.log(`\n共校验 ${checked} 个云函数，异常 ${bad} 个。`);
process.exit(bad > 0 ? 1 : 0);
