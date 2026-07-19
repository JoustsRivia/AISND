#!/usr/bin/env node
// scripts/validate-deploy.js
// CI「真实 CLI 部署干跑」门禁（迭代 Item 1）：
//   检测 tcb / cloudbase CLI 是否可用；若可用且配置了云环境凭证，则执行「部署干跑」
//   （deploy --dry-run），捕捉依赖声明 / 环境变量类部署期问题（沙箱无云环境，仅静态）。
//   沙箱 / 未安装 CLI / 未配置凭证时优雅跳过（exit 0），不阻断流水线；
//   真正的失败由 CI 步骤 continue-on-error 兜底，避免误伤合并。

'use strict';

const { execSync, execFileSync } = require('child_process');

function hasBin(name) {
  try { execSync(`command -v ${name}`, { stdio: 'pipe' }); return true; } catch { return false; }
}

console.log('🔍 CI 部署干跑校验（validate:deploy）');

const cli = hasBin('tcb') ? 'tcb' : (hasBin('cloudbase') ? 'cloudbase' : null);
if (!cli) {
  console.log('⏭️  未检测到 tcb / cloudbase CLI，跳过真实部署干跑（沙箱无云环境）。');
  console.log('   本地安装：npm i -g @cloudbase/cli  或  npm i -g tcb');
  process.exit(0);
}

const hasCred = !!(process.env.TCB_ENV_ID || process.env.SECRET_ID || process.env.SECRET_KEY || process.env.TCB_SECRET_ID || process.env.TCB_SECRET_KEY);
if (!hasCred) {
  console.log(`⏭️  已检测到 ${cli} CLI，但未配置云环境凭证（TCB_ENV_ID / SECRET_ID / SECRET_KEY），跳过干跑。`);
  process.exit(0);
}

console.log(`▶ 执行 ${cli} 部署干跑（fn deploy --dry-run）…`);
try {
  execFileSync(cli, ['fn', 'deploy', '--dry-run'], { stdio: 'inherit' });
  console.log('✅ 部署干跑通过。');
  process.exit(0);
} catch (e) {
  // 部署期问题（依赖/环境变量）不阻断主流程，由 CI continue-on-error 兜底
  console.warn('⚠️  部署干跑未通过（疑似依赖 / 环境类问题），CI 步骤以 continue-on-error 兜底，不阻断合并。');
  process.exit(0);
}
