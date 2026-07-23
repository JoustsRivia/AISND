'use strict';
// tests/tool-check-features.test.js
//
// 简单需求项后端行为单测（R15 / R18 / R19）：
//   - R15 tool.create / import：未传 code 时自动生成 GL-{YY}-{缩写}-{0001}，同类别流水自增
//   - R18 tool.detail：履历 operations 的 by(openid) 解析为可读 operatorName
//   - R19 check.reportHazard：关联器具的隐患上报 → 器具状态置为 maintaining；通用隐患不动器具
//
// 运行：node --test tests/tool-check-features.test.js
// 依赖：仅 Node 内置（node:test / node:assert），沿用 mock-cloud 拦截层。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const tool = require('../cloudfunctions/tool/index');
const check = require('../cloudfunctions/check/index');
const mock = require('./mock-cloud');

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

// ───────────────────────── R15 器具编号自动生成 ─────────────────────────
test('R15 tool.create: 不传 code 时自动生成 GL-{YY}-{缩写}-{0001}', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  const r = await tool.main({ action: 'create', payload: { name: '扳手', category: 'manual', orgId: 'o1' } });
  assert.strictEqual(r.code, 0);
  assert.match(r.data.code, /^GL-\d{2}-GJ-0001$/); // manual → 工具 GJ
});

test('R15 tool.create: 危险类别映射正确（insulation → YQ）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  const r = await tool.main({ action: 'create', payload: { name: '绝缘杆', category: 'insulation', orgId: 'o1' } });
  assert.strictEqual(r.code, 0);
  assert.match(r.data.code, /^GL-\d{2}-YQ-0001$/);
});

test('R15 tool.create: 同类别第二次创建流水号 +1', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  await tool.main({ action: 'create', payload: { name: '扳手1', category: 'manual', orgId: 'o1' } });
  const r2 = await tool.main({ action: 'create', payload: { name: '扳手2', category: 'manual', orgId: 'o1' } });
  assert.strictEqual(r2.code, 0);
  assert.match(r2.data.code, /^GL-\d{2}-GJ-0002$/);
});

test('R15 tool.create: 显式传入 code 时原样保留', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  const r = await tool.main({ action: 'create', payload: { name: '扳手', category: 'manual', orgId: 'o1', code: 'CUSTOM-001' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.code, 'CUSTOM-001');
});

test('R15 tool.import: 每行未传 code 时按类别自增生成', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  const r = await tool.main({ action: 'import', payload: { rows: [
    { name: '钳子', category: 'manual' },
    { name: '螺丝刀', category: 'manual' },
  ] } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.count, 2);
  const codes = mock.__store.tools.map((t) => t.code).sort();
  assert.match(codes[0], /^GL-\d{2}-GJ-0001$/);
  assert.match(codes[1], /^GL-\d{2}-GJ-0002$/);
});

// ───────────────────────── R18 履历操作人姓名 ─────────────────────────
test('R18 tool.detail: 履历操作人 by(openid) 解析为 operatorName', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'opener_x', nickname: '张三', username: 'zhang' }];
  mock.__store.tools = [{
    _id: 't1', code: 'GL-26-GJ-0001', name: '扳手', category: 'manual', status: 'qualified',
    operations: [{ type: 'borrow', ts: new Date().toISOString(), by: 'opener_x', note: '领用' }],
    testRecords: [],
  }];
  const r = await tool.main({ action: 'detail', payload: { id: 't1' } });
  assert.strictEqual(r.code, 0);
  const op = r.data.operations[0];
  assert.strictEqual(op.operatorName, '张三'); // 非 openid，为可读姓名
});

// ───────────────────────── R19 点检异常同步器具状态 ─────────────────────────
test('R19 check.reportHazard: 关联器具的隐患上报 → 器具状态置为 maintaining', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'safety_officer', orgId: 'o1', status: 'active' }];
  mock.__store.tools = [{ _id: 't1', code: 'GL-26-GJ-0001', name: '扳手', status: 'qualified', orgId: 'o1' }];
  const r = await check.main({ action: 'reportHazard', payload: { desc: '绝缘破损', toolId: 't1', orgId: 'o1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(mock.__store.tools[0].status, 'maintaining');
});

test('R19 check.reportHazard: 无 toolId 的通用隐患不改动器具状态', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'safety_officer', orgId: 'o1', status: 'active' }];
  mock.__store.tools = [{ _id: 't1', status: 'qualified' }];
  const r = await check.main({ action: 'reportHazard', payload: { desc: '环境隐患', orgId: 'o1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(mock.__store.tools[0].status, 'qualified');
});
