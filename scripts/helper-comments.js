#!/usr/bin/env node
// scripts/helper-comments.js
// 云函数 helpers 注释规范校验 / 修复工具。
//
// 规则（来自迭代建议 item 6）：cloudfunctions/<fn>/helpers/db.js 与 user.js 的
// 第一行情景注释必须以「本函数真实路径」开头，即 `// cloudfunctions/<fn>/helpers/<name>.js`。
// 该首行用于迁移改写时快速识别归属函数；复制粘贴残留的 `cloudfunctions/tpl/...`
// 会误导维护者，故必须保持与真实路径一致。
//
// 用法：
//   node scripts/helper-comments.js          # 仅检查，发现不符则退出码 1（CI 用）
//   node scripts/helper-comments.js --fix    # 就地把首行重写为真实路径
//
// 设计约束（可迁移契约）：本脚本只读取 helpers 首行，绝不改写任何业务逻辑。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLOUD_DIR = path.join(ROOT, 'cloudfunctions');
const FIX = process.argv.includes('--fix');

// 收集 cloudfunctions/<fn>/helpers/{db,user}.js
function collect() {
  const files = [];
  if (!fs.existsSync(CLOUD_DIR)) return files;
  for (const fn of fs.readdirSync(CLOUD_DIR)) {
    const helpers = path.join(CLOUD_DIR, fn, 'helpers');
    if (!fs.existsSync(helpers) || !fs.statSync(helpers).isDirectory()) continue;
    for (const name of ['db.js', 'user.js']) {
      const p = path.join(helpers, name);
      if (fs.existsSync(p)) files.push(p);
    }
  }
  return files.sort();
}

// 由文件路径推导期望的首行
function expectedFirstLine(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  return `// ${rel}`;
}

function run() {
  const files = collect();
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const firstLine = text.split('\n')[0];
    const expected = expectedFirstLine(file);
    if (!firstLine.startsWith(expected)) {
      problems.push({ file, firstLine, expected });
    }
  }

  if (problems.length === 0) {
    console.log(`✅ helpers 注释规范校验通过：${files.length} 个文件首行均为真实路径。`);
    process.exit(0);
  }

  console.log(`⚠️ 发现 ${problems.length}/${files.length} 个 helper 首行未标注真实路径：`);
  for (const p of problems) {
    console.log(`   - ${path.relative(ROOT, p.file)}`);
    console.log(`       实际: ${p.firstLine}`);
    console.log(`       期望: ${p.expected}`);
  }

  if (!FIX) {
    console.log('\n（运行 `node scripts/helper-comments.js --fix` 可自动修正）');
    process.exit(1);
  }

  // fix：仅重写首行，保留其余内容
  for (const p of problems) {
    const text = fs.readFileSync(p.file, 'utf8');
    const lines = text.split('\n');
    lines[0] = p.expected;
    fs.writeFileSync(p.file, lines.join('\n'));
    console.log(`   ✏️  已修正 ${path.relative(ROOT, p.file)} → ${p.expected}`);
  }
  console.log(`\n✅ 已修正 ${problems.length} 个文件，请重新运行本脚本确认。`);
  process.exit(0);
}

run();
