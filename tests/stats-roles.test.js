'use strict';
// tests/stats-roles.test.js
//
// 词表统一（2026-08-08）：
//   - stats 敏感操作（sixStandard/exportReport）白名单 = 单位级及以上管理码
//     ['admin','a1','a2','b11','b12','c11','c12']（幽灵码 manager/system 已移除）
//   - 定时快照（无微信用户上下文）以 SYSTEM_USER(admin) 执行，不再因 ensureLogin 失败
//
// 运行：node --test tests

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const stats = require('../cloudfunctions/stats/index');
const mock = require('./mock-cloud');

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('u1');
});

const ORGS = [{ _id: 'o1', parentId: '', level: 0 }];
function seed() {
  mock.__store.orgs = ORGS.map((o) => ({ ...o }));
  mock.__store.tools = [{
    _id: 't1', orgId: 'o1', status: 'qualified',
    name: '绝缘手套', code: 'C1', category: 'insulation',
    expireAt: '2099-01-01', store: '库房A',
  }];
}

test('sixStandard: 单位级管理码 b11 放行（6 维指标）', async () => {
  seed();
  mock.__store.users = [{ openid: 'u1', role: 'b11', orgId: 'o1', status: 'active' }];
  const r = await stats.main({ action: 'sixStandard', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.dims.length, 6);
});

test('sixStandard: 平台安监 a1 放行（全局档）', async () => {
  seed();
  mock.__store.users = [{ openid: 'u1', role: 'a1', orgId: '', status: 'active' }];
  const r = await stats.main({ action: 'sixStandard', payload: {} });
  assert.strictEqual(r.code, 0);
});

test('sixStandard: 班组作业 b24 被拒', async () => {
  seed();
  mock.__store.users = [{ openid: 'u1', role: 'b24', orgId: 'o1', status: 'active' }];
  const r = await stats.main({ action: 'sixStandard', payload: {} });
  assert.strictEqual(r.code, 1);
  assert.match(r.message, /无权限/);
});

test('exportReport: admin 放行、班组作业 b24 被拒', async () => {
  seed();
  mock.__store.users = [{ openid: 'u1', role: 'admin', orgId: '', status: 'active' }];
  const r = await stats.main({ action: 'exportReport', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.ok(r.data.csv);
  mock.__store.users = [{ openid: 'u1', role: 'b24', orgId: 'o1', status: 'active' }];
  const r2 = await stats.main({ action: 'exportReport', payload: {} });
  assert.strictEqual(r2.code, 1);
  assert.match(r2.message, /无权限/);
});

test('snapshot: 定时器触发（无微信上下文）以系统身份成功采集并写 daily_stats', async () => {
  seed();
  mock.__store.users = [{ openid: 'u1', role: 'b24', orgId: 'o1', status: 'active' }]; // 普通用户也在线，但快照不受其角色影响
  const r = await stats.main({ triggerName: 'dailySnapshot' });
  assert.strictEqual(r.code, 0);
  const saved = mock.__store.daily_stats;
  assert.ok(saved && saved.length === 1, '应写入一条 daily_stats');
  assert.strictEqual(saved[0].total, 1);
  assert.strictEqual(saved[0].dims.length, 6);
});
