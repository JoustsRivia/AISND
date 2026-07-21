#!/usr/bin/env node
// scripts/secret-scan.js
// 源码硬编码凭据扫描（迭代建议 item 3 · 安全）。零依赖，仅 Node 内置模块。
//
// 目标：在合并/部署前拦住「把口令/密钥写死在源码里」的回归（如早期登录页硬编码管理员口令）。
// 设计约束（可迁移契约）：只读取源码做静态字符串匹配，绝不改写任何业务逻辑。
//
// 用法：
//   node scripts/secret-scan.js          # 扫描，发现疑似硬编码凭据则退出码 1（CI 用）
//   node scripts/secret-scan.js --fix     # 当前未实现自动修复，仅列出（占位，避免误改业务）

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 扫描范围：业务源码；排除脚本自身与 node_modules（tests/、scaffolds/ 不在扫描目录内）
const SCAN_DIRS = ['utils', 'pages', 'components', 'cloudfunctions', 'app.js'];
const EXCLUDE_DIRS = ['node_modules'];
const EXCLUDE_FILES = ['secret-scan.js', 'helper-comments.js', 'mock-cloud.js'];

// 命中即视为高危：变量名含这些词，且被直接赋值为字符串字面量（非 process.env / 非函数调用 / 非占位符）
const KEYWORDS = [
  'password', 'passwd', 'pwd', 'secret', 'apikey', 'api_key',
  'token', 'accesskey', 'access_key', 'privatekey', 'private_key', 'secretkey', 'secret_key',
];

// 仅当「右值是真字符串字面量」才告警：'...' / "..." / `...`（排除含 ${} 的模板串与过短串）
const SECRET_RE = new RegExp(
  `\\b(${KEYWORDS.join('|')})\\b\\s*[:=]\\s*(['"\`])(?![\\s]*\\$\\{)[^'"\`\\$\\n]{4,}\\2`,
  'gi',
);

// 这些右值即使匹配也应放行（环境占位符、明显非密文）
const SAFE_RIGHT = /process\.env|getEnv|wx\.|require\(|config\.|mock|test_|example|xxxx/i;

function walk(file, out) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  let stat;
  try { stat = fs.statSync(full); } catch { return; }
  if (stat.isDirectory()) {
    if (EXCLUDE_DIRS.includes(path.basename(full))) return;
    for (const child of fs.readdirSync(full)) walk(path.join(file, child), out);
  } else {
    if (!file.endsWith('.js')) return;
    if (EXCLUDE_FILES.includes(path.basename(full))) return;
    out.push(file);
  }
}

function run() {
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);
  files.sort();

  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return; // 跳过整行注释
      const m = line.match(SECRET_RE);
      if (!m) return;
      if (SAFE_RIGHT.test(line)) return; // 明显非硬编码密文
      hits.push({ file: f, line: i + 1, text: line.trim() });
    });
  }

  if (hits.length === 0) {
    console.log(`✅ 硬编码凭据扫描通过：扫描 ${files.length} 个源文件，无疑似硬编码口令/密钥。`);
    process.exit(0);
  }

  console.log(`⚠️ 在 ${hits.length} 处发现疑似硬编码凭据（请改由云函数环境变量 / 后端持有）：`);
  for (const h of hits) {
    console.log(`   - ${h.file}:${h.line}  ${h.text}`);
  }
  console.log('\n（口令/密钥应移至云函数环境变量或后端，禁止落源码；如需误报白名单请联系维护者）');
  process.exit(1);
}

run();
