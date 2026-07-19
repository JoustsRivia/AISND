'use strict';
// cloudfunctions/_tests/system-log.test.js
//
// 覆盖迭代 Item 3（审计日志合规留存 + 字段级权限）+ Item 4（服务端分页）后端逻辑：
//   - log：写入合规字段 serverTime / retainedUntil / source，并保留 operatorName / clientTime 透传
//   - listLog：type / operatorName / keyword / 时间区间 组合过滤 + 服务端分页(skip/limit/total/hasMore)
//             + 字段级权限（非管理员强制仅见自身，管理员可切 scope）
//   - cleanupLogs：超期(retainedUntil)日志清理；定时器(triggerName)触发免管理员校验
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
test('system.listLog: 非管理员仅见自身（字段级权限，不报错）', async () => {
  mock.__store.users = [{ _id: 'u2', openid: 'test_openid', role: 'worker', status: 'active', bound: true }];
  mock.__store.operation_logs = [
    { _id: 'a', type: 'borrow', operator: 'test_openid', operatorName: '我', ts: Date.parse('2026-01-01') },
    { _id: 'b', type: 'borrow', operator: 'other', operatorName: '他人', ts: Date.parse('2026-02-01') },
  ];
  const r = await system.main({ action: 'listLog', payload: {} });
  assert.strictEqual(r.code, 0);                 // 不报错
  assert.strictEqual(r.data.list.length, 1);     // 仅见自身
  assert.strictEqual(r.data.list[0]._id, 'a');
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
  assert.strictEqual(r.data.list.length, 2);
  assert.strictEqual(r.data.list[0]._id, 'l3'); // 倒序：最新在前
  assert.strictEqual(r.data.list[1]._id, 'l1');
});

test('system.listLog: 按 operatorName 过滤', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({ action: 'listLog', payload: { operatorName: '张三' } });
  assert.strictEqual(r.data.list.length, 2);
  assert.ok(r.data.list.every((x) => x.operatorName === '张三'));
});

test('system.listLog: 按 keyword 模糊匹配 target', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({ action: 'listLog', payload: { keyword: 'T2' } });
  assert.strictEqual(r.data.list.length, 1);
  assert.strictEqual(r.data.list[0]._id, 'l2');
});

test('system.listLog: 按时间区间过滤', async () => {
  seedAdmin(); seedLogs();
  const r = await system.main({
    action: 'listLog',
    payload: { startTime: Date.parse('2026-02-01'), endTime: Date.parse('2026-02-28T23:59:59') },
  });
  assert.strictEqual(r.data.list.length, 1);
  assert.strictEqual(r.data.list[0]._id, 'l2');
});

// ───────────────────────── listLog：服务端分页（Item 4）─────────────────────────
test('system.listLog: 服务端分页 skip/limit/total/hasMore', async () => {
  seedAdmin(); seedLogs();
  const p1 = await system.main({ action: 'listLog', payload: { limit: 2, skip: 0 } });
  assert.strictEqual(p1.code, 0);
  assert.strictEqual(p1.data.list.length, 2);
  assert.strictEqual(p1.data.total, 3);
  assert.strictEqual(p1.data.hasMore, true);
  const p2 = await system.main({ action: 'listLog', payload: { limit: 2, skip: 2 } });
  assert.strictEqual(p2.data.list.length, 1);
  assert.strictEqual(p2.data.hasMore, false);
});

// ───────────────────────── listLog：字段级权限（Item 3）─────────────────────────
test('system.listLog: 非管理员强制 scope=mine 仅见自身（请求 all 也收窄）', async () => {
  mock.__store.users = [{ _id: 'u2', openid: 'test_openid', role: 'worker', status: 'active', bound: true }];
  mock.__store.operation_logs = [
    { _id: 'a', type: 'borrow', operator: 'test_openid', operatorName: '我', ts: Date.parse('2026-01-01') },
    { _id: 'b', type: 'borrow', operator: 'other_openid', operatorName: '他人', ts: Date.parse('2026-02-01') },
  ];
  const r = await system.main({ action: 'listLog', payload: { scope: 'all' } });
  assert.strictEqual(r.data.list.length, 1);
  assert.strictEqual(r.data.list[0]._id, 'a');
});

test('system.listLog: 管理员 scope=mine 仅见自身', async () => {
  seedAdmin();
  mock.__store.operation_logs = [
    { _id: 'a', type: 'borrow', operator: 'test_openid', operatorName: 'admin', ts: Date.parse('2026-01-01') },
    { _id: 'b', type: 'borrow', operator: 'other', operatorName: '他人', ts: Date.parse('2026-02-01') },
  ];
  const r = await system.main({ action: 'listLog', payload: { scope: 'mine' } });
  assert.strictEqual(r.data.list.length, 1);
  assert.strictEqual(r.data.list[0]._id, 'a');
});

// ───────────────────────── cleanupLogs：超期清理（Item 3）─────────────────────────
test('system.cleanupLogs: 删除 retainedUntil 到期记录，保留未到期', async () => {
  seedAdmin();
  const past = new Date('2020-01-01');
  const future = new Date('2099-01-01');
  mock.__store.operation_logs = [
    { _id: 'old1', type: 'borrow', operator: 'o1', retainedUntil: past },
    { _id: 'old2', type: 'borrow', operator: 'o2', retainedUntil: past },
    { _id: 'new1', type: 'borrow', operator: 'o3', retainedUntil: future },
  ];
  const r = await system.main({ action: 'cleanupLogs', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.removed, 2);
  assert.strictEqual(mock.__store.operation_logs.length, 1);
  assert.strictEqual(mock.__store.operation_logs[0]._id, 'new1');
});

test('system.cleanupLogs: 定时器触发(triggerName)免管理员校验', async () => {
  // 非管理员 + 定时器触发（无 action，由 triggerName 路由）
  mock.__store.users = [{ _id: 'u2', openid: 'x', role: 'worker', status: 'active', bound: true }];
  const past = new Date('2020-01-01');
  mock.__store.operation_logs = [
    { _id: 'old1', type: 'borrow', operator: 'o1', retainedUntil: past },
  ];
  const r = await system.main({ triggerName: 'logCleanup', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.removed, 1);
});
