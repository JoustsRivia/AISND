'use strict';
// cloudfunctions/_tests/system-log.test.js
//
// 覆盖迭代 Item 3（审计日志合规留存）+ Item 4（日志面板增强后端）后端逻辑：
//   - log：写入合规字段 serverTime / retainedUntil / source，并保留 operatorName / clientTime 透传
//   - listLog：type / operatorName / keyword / 时间区间 组合过滤
//
// 运行：node --test cloudfunctions/_tests   （pretest 会自动打包隔离层，或本文件顶部自举打包）
// 依赖：仅 Node 内置。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

// 自举：确保隔离层副本已生成（即使不通过 npm pretest 直接运行本文件也能解析 ./dbBase / ./userBase）
const { execSync } = require('child_process');
const path = require('path');
try {
  execSync('node scripts/bundle-db-base.js', { cwd: path.resolve(__dirname, '..', '..'), stdio: 'pipe' });
} catch (e) { /* 已由 pretest 生成则忽略 */ }

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const system = require('../system/index');
const mock = require('./mock-cloud');

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

function seedAdmin() {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'admin', status: 'active', bound: true }];
}

// ───────────────────────── log：合规字段 ─────────────────────────
test('system.log: 写入双时间戳(serverTime)与留存到期(retainedUntil)与来源标记', async () => {
  const r = await system.main({
    action: 'log',
    payload: { type: 'borrow', action: 'borrow', target: 'T1', operatorName: '张三', clientTime: 1700000000000 },
  });
  assert.strictEqual(r.code, 0);
  const log = mock.__store.operation_logs[0];
  assert.ok(log, '应写入 operation_logs');
  assert.strictEqual(log.operator, 'test_openid');
  assert.strictEqual(log.operatorName, '张三');     // 透传富化字段
  assert.strictEqual(log.clientTime, 1700000000000); // 客户端时刻透传
  assert.ok(log.serverTime, '应写入服务端落点时刻');
  assert.strictEqual(log.source, 'client');
  assert.ok(log.retainedUntil instanceof Date && log.retainedUntil > log.serverTime, '合规留存到期应晚于落点');
});

// ───────────────────────── listLog：鉴权 ─────────────────────────
test('system.listLog: 非管理员被拒（403）', async () => {
  mock.__store.users = [{ _id: 'u2', openid: 'test_openid', role: 'worker', status: 'active', bound: true }];
  const r = await system.main({ action: 'listLog', payload: {} });
  assert.strictEqual(r.code, 403);
});

// ───────────────────────── listLog：组合筛选 ─────────────────────────
function seedLogs() {
  mock.__store.operation_logs = [
    { _id: 'l1', type: 'borrow', action: 'borrow', target: 'T1', operatorName: '张三', operator: 'o1', ts: Date.parse('2026-01-01T10:00:00') },
    { _id: 'l2', type: 'scrap', action: 'scrap', target: 'T2', operatorName: '李四', operator: 'o2', ts: Date.parse('2026-02-01T10:00:00') },
    { _id: 'l3', type: 'borrow', action: 'return', target: 'T1', operatorName: '张三', operator: 'o1', ts: Date.parse('2026-03-01T10:00:00') },
  ];
}

test('system.listLog: 按 type 过滤 + 时间倒序', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({ action: 'listLog', payload: { type: 'borrow' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0]._id, 'l3'); // 倒序：最新在前
  assert.strictEqual(r.data[1]._id, 'l1');
});

test('system.listLog: 按 operatorName 过滤', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({ action: 'listLog', payload: { operatorName: '张三' } });
  assert.strictEqual(r.data.length, 2);
  assert.ok(r.data.every((x) => x.operatorName === '张三'));
});

test('system.listLog: 按 keyword 模糊匹配 target', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({ action: 'listLog', payload: { keyword: 'T2' } });
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'l2');
});

test('system.listLog: 按时间区间过滤', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({
    action: 'listLog',
    payload: { startTime: Date.parse('2026-02-01'), endTime: Date.parse('2026-02-28T23:59:59') },
  });
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'l2');
});
