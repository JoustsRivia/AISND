#!/usr/bin/env node
// scripts/gen-seed.js
// 生成「种子管理员强口令」建议片段，配合 DEPLOY.md 在云函数环境变量配置，
// 避免默认凭证（Jousts / qwer1234）进入源码 / 小程序包。
//
// 用法：node scripts/gen-seed.js
//   - 仅本地输出建议值，不写入任何文件、不回传前端。

'use strict';

const crypto = require('crypto');

function strongPassword(len = 18) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const sym = '!@#$%^&*-_=+';
  const all = upper + lower + digit + sym;
  const pick = (s) => s[crypto.randomInt(s.length)];
  let out = pick(upper) + pick(lower) + pick(digit) + pick(sym);
  const rnd = crypto.randomBytes(len);
  for (let i = out.length; i < len; i++) out += all[rnd[i] % all.length];
  // 打乱顺序，避免固定位置规律
  return out.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

const username = 'admin_' + crypto.randomBytes(3).toString('hex');
const password = strongPassword(18);
console.log('# 种子管理员强凭证建议（在云函数环境变量配置，切勿写入源码）');
console.log(`SEED_ADMIN_USERNAME=${username}`);
console.log(`SEED_ADMIN_PASSWORD=${password}`);
console.log('\n# 配置位置：微信云开发控制台 → 云函数 system → 环境变量');
console.log('# 详细说明见 DEPLOY.md');
