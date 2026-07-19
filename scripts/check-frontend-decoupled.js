#!/usr/bin/env node
// scripts/check-frontend-decoupled.js
// 前端零直连自动化门禁（迭代 Item 7，把架构铁律①变成不可绕过的流水线卡点）。
//
// 相比上一代固定正则脚本，本版升级为「可配置规则引擎」：
//   1. 规则外置：每条规则含 id / severity / pattern / message / allow(豁免白名单) / dimension，
//      默认规则见下方 DEFAULT_RULES，可用 --config=path.json 或环境变量 FRONTEND_DECOUPLE_CONFIG 覆盖。
//   2. 维度分层上报：按文件位置归类为 pages / components / utils / other，
//      单独统计 components/** 违规，便于在 PR 评论中按模块定位（§4 #7）。
//   3. CI 友好：命中时输出 GitHub Actions 注解（::error file=…::），可直接在 PR 检查/评论中精确到行。
//   4. 自检模式（--self-test）：注入合成违规与豁免样本，验证引擎「该拦的拦、该豁免的豁免」，
//      防止规则漂移导致门禁形同虚设。
//
// 用法：
//   node scripts/check-frontend-decoupled.js [--self-test] [--json] [--strict] [--config=path.json]
// 退出码：
//   0 = 通过（或自检通过）   1 = 存在 error 级违规   2 = 自检失败

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── 默认规则配置 ───────────────────────────────────────────────────────
// 每条规则字段：
//   id        唯一标识（作为注解 title，便于 PR 评论/趋势追踪）
//   severity  'error' 阻断合并 | 'warning' 仅提示
//   pattern   禁止模式正则（字符串，引擎内 new RegExp(pattern, 'g')）
//   message   违规说明
//   allow     豁免文件相对 ROOT 的白名单（授权 transport 层 / 初始化引导）
//   dimension 语义维度（用于归类与趋势，不影响拦截判定）
const DEFAULT_RULES = [
  {
    id: 'forbidden-call',
    severity: 'error',
    pattern: String.raw`\bwx\.cloud\.(callFunction|database|uploadFile|downloadFile)\b`,
    message: '禁止直接调用 wx.cloud.callFunction/database/uploadFile/downloadFile，请改用 utils/api.js 统一入口',
    allow: ['app.js', 'utils/api.js'],
    dimension: 'forbidden-call',
  },
  {
    id: 'cloud-init-location',
    severity: 'error',
    pattern: String.raw`\bwx\.cloud\.init\b`,
    message: 'wx.cloud.init 仅允许出现在 app.js（云开发初始化引导）',
    allow: ['app.js'],
    dimension: 'cloud-init',
  },
];

const SKIP_DIRS = new Set(['node_modules', 'cloudfunctions', '.git', 'miniprogram_npm', 'scripts']);

// ── 规则加载（可被外部 JSON 覆盖）───────────────────────────────────────
function loadRules() {
  let cfgPath = process.env.FRONTEND_DECOUPLE_CONFIG || '';
  const argIdx = process.argv.findIndex((a) => a.startsWith('--config='));
  if (argIdx >= 0) cfgPath = process.argv[argIdx].slice('--config='.length);
  if (cfgPath) {
    try {
      const raw = fs.readFileSync(path.resolve(ROOT, cfgPath), 'utf8');
      const custom = JSON.parse(raw);
      if (!Array.isArray(custom) || !custom.length) throw new Error('规则须为非空数组');
      // 基本校验：每条规则必须有 id / pattern
      for (const r of custom) {
        if (!r || !r.id || !r.pattern) throw new Error('规则缺少 id 或 pattern');
        r.severity = r.severity === 'warning' ? 'warning' : 'error';
        r.allow = Array.isArray(r.allow) ? r.allow : [];
      }
      console.log(`ℹ️ 已加载外部规则配置：${cfgPath}（${custom.length} 条）`);
      return custom;
    } catch (e) {
      console.error(`❌ 外部规则配置加载失败（回退默认规则）：${e.message}`);
    }
  }
  return DEFAULT_RULES;
}

// 按文件相对路径归类维度（pages / components / utils / other）
function dimensionOf(rel) {
  const seg = rel.split(path.sep);
  if (seg[0] === 'pages') return 'pages';
  if (seg[0] === 'components') return 'components';
  if (seg[0] === 'utils') return 'utils';
  return 'other';
}

// 扫描单个文件内容，返回违规数组（已应用豁免白名单）
function scanFile(rel, content, rules) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (const rule of rules) {
    const allowed = new Set(rule.allow.map((a) => path.normalize(a)));
    if (allowed.has(path.normalize(rel))) continue; // 授权豁免，跳过整条规则
    let re;
    try { re = new RegExp(rule.pattern, 'g'); } catch { continue; }
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) {
        violations.push({
          rel, line: i + 1,
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          dimension: dimensionOf(rel),
        });
      }
    });
  }
  return violations;
}

function collectFiles() {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIRS.has(e)) walk(p); }
      else if (path.extname(p) === '.js') out.push(p);
    }
  })(ROOT);
  return out;
}

// 真实扫描：遍历仓库前端 JS
function runReal(rules) {
  const files = collectFiles();
  let all = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    all = all.concat(scanFile(rel, content, rules));
  }
  return all;
}

// 报告并决定是否退出非零
function report(all, { json, strict }) {
  const errors = all.filter((v) => v.severity === 'error');
  const warnings = all.filter((v) => v.severity === 'warning');

  if (json) {
    process.stdout.write(JSON.stringify({
      errors: errors.length,
      warnings: warnings.length,
      violations: all,
    }, null, 2) + '\n');
  }

  // CI 注解（精确到行，便于 PR 评论/检查）
  for (const v of all) {
    const lvl = v.severity === 'error' ? 'error' : 'warning';
    process.stderr.write(`::${lvl} file=${v.rel},line=${v.line},title=${v.ruleId}::${v.message}\n`);
  }

  // 维度分层汇总（含 components 单独维度）
  const dims = {};
  for (const v of all) {
    dims[v.dimension] = dims[v.dimension] || { error: 0, warning: 0 };
    dims[v.dimension][v.severity]++;
  }
  const dimKeys = Object.keys(dims);

  if (all.length === 0) {
    console.log('✅ 前端零直连校验通过：pages/、components/ 及前端 utils 均未直连 wx.cloud.*（统一入口仅 utils/api.js）。');
    return 0;
  }

  console.error('\n──────── 前端门禁违规汇总（按维度）────────');
  for (const d of dimKeys) {
    const info = dims[d];
    console.error(`• ${d.padEnd(11)} error=${info.error}  warning=${info.warning}`);
  }
  console.error(`───────────────────────────────────────────`);
  for (const v of all) {
    console.error(`❌ [${v.ruleId}] (${v.severity}) ${v.rel}:${v.line} — ${v.message}`);
  }

  const failOnWarn = strict && warnings.length > 0;
  if (errors.length > 0 || failOnWarn) {
    console.error(`\n发现 ${errors.length} 处 error 违规${strict ? ` + ${warnings.length} 处 warning（--strict）` : ''}，违反架构铁律①（前端统一入口）。`);
    return 1;
  }
  console.log(`\n仅 ${warnings.length} 处 warning，未阻断（加 --strict 可将其升级为错误）。`);
  return 0;
}

// ── 自检：验证引擎「该拦的拦、该豁免的豁免」─────────────────────────────
function selfTest(rules) {
  const cases = [
    { name: '页面直连应被拦截', rel: 'pages/__selftest__/bad.js', content: "wx.cloud.callFunction({ name: 'x' });", expect: 'violation' },
    { name: '组件直连应被拦截并归入 components 维度', rel: 'components/__selftest__/bad.js', content: 'const db = wx.cloud.database();', expect: 'violation', wantDim: 'components' },
    { name: 'utils/api.js 直连应被豁免', rel: 'utils/api.js', content: "wx.cloud.callFunction({ name: 'x' });", expect: 'clean' },
    { name: 'app.js 初始化应被豁免', rel: 'app.js', content: 'wx.cloud.init({});', expect: 'clean' },
    { name: '页面初始化应被拦截（init 仅限 app.js）', rel: 'pages/x.js', content: 'wx.cloud.init({});', expect: 'violation' },
    { name: '页面下载直连应被拦截', rel: 'pages/y.js', content: 'wx.cloud.downloadFile({});', expect: 'violation' },
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const vs = scanFile(c.rel, c.content, rules);
    const got = vs.length ? 'violation' : 'clean';
    let ok = got === c.expect;
    if (ok && c.wantDim && vs[0].dimension !== c.wantDim) ok = false;
    console.log(`${ok ? '✅' : '❌'} self-test: ${c.name}${c.wantDim ? `（维度=${c.wantDim}）` : ''}（期望 ${c.expect}，实际 ${got}）`);
    ok ? pass++ : fail++;
  }
  console.log(`\nself-test 结果：${pass} 通过 / ${fail} 失败`);
  return fail > 0 ? 2 : 0;
}

// ── 入口 ────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const doSelfTest = args.includes('--self-test');
  const json = args.includes('--json');
  const strict = args.includes('--strict');

  const rules = loadRules();

  if (doSelfTest) {
    process.exit(selfTest(rules));
  }

  const all = runReal(rules);
  process.exit(report(all, { json, strict }));
}

main();
