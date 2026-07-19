'use strict';
// cloudfunctions/_tests/cloud-functions-2.test.js
//
// 扩展单测覆盖（迭代建议 item 1）：borrow / maintenance / store / reconcile 四个核心云函数。
// 沿用同一 mock-cloud 拦截层，业务云函数（index.js + helpers）零改动，证明「换掉 wx-server-sdk 即可复用」。
//
// 运行：node --test cloudfunctions/_tests/cloud-functions-2.test.js
// 依赖：仅 Node 内置（node:test / node:assert），无需安装依赖。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const borrow = require('../borrow/index');
const maintenance = require('../maintenance/index');
const store = require('../store/index');
const reconcile = require('../reconcile/index');
const mock = require('./mock-cloud');

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

// ───────────────────────── borrow：领用 / 归还（M5） ─────────────────────────
test('borrow.borrow: 合格且在期内的普通器具可领用（status → in_use）', async () => {
  mock.__store.tools = [{
    _id: 't1', code: 'C1', name: '扳手', category: 'common',
    status: 'qualified', expireAt: new Date(Date.now() + 8.64e7).toISOString(),
  }];
  const r = await borrow.main({ action: 'borrow', payload: { id: 't1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'in_use');
  assert.strictEqual(mock.__store.tools[0].status, 'in_use');
  assert.strictEqual(mock.__store.borrow_records.length, 1);
});

test('borrow.borrow: 器具不合格被拒', async () => {
  mock.__store.tools = [{ _id: 't1', status: 'maintaining' }];
  const r = await borrow.main({ action: 'borrow', payload: { id: 't1' } });
  assert.strictEqual(r.code, 1);
  assert.match(r.message, /不合格/);
});

test('borrow.borrow: 特种设备缺对应有效证件被拒（越权守卫）', async () => {
  mock.__store.tools = [{
    _id: 't1', category: 'lifting', status: 'qualified',
    expireAt: new Date(Date.now() + 8.64e7).toISOString(),
  }];
  const r = await borrow.main({ action: 'borrow', payload: { id: 't1' } });
  assert.strictEqual(r.code, 1);
  assert.match(r.message, /证件/);
});

test('borrow.borrow: 特种设备持对应有效证件可领用', async () => {
  mock.__store.tools = [{
    _id: 't1', category: 'lifting', status: 'qualified',
    expireAt: new Date(Date.now() + 8.64e7).toISOString(),
  }];
  mock.__store.certificates = [{
    openid: 'test_openid', status: 'valid', category: 'lifting',
    expireAt: new Date(Date.now() + 8.64e7).toISOString(),
  }];
  const r = await borrow.main({ action: 'borrow', payload: { id: 't1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'in_use');
});

test('borrow.return: 外观损坏 → 器具转 maintaining 且自动生成报修单', async () => {
  mock.__store.tools = [{ _id: 't1', code: 'C1', name: '扳手', status: 'in_use' }];
  const r = await borrow.main({ action: 'return', payload: { id: 't1', appearance: 'damaged' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'maintaining');
  assert.strictEqual(mock.__store.tools[0].status, 'maintaining');
  assert.strictEqual(mock.__store.repair_records.length, 1);
  assert.strictEqual(mock.__store.repair_records[0].auto, true);
});

test('borrow.return: 外观正常 → 器具回 qualified', async () => {
  mock.__store.tools = [{ _id: 't1', status: 'in_use' }];
  const r = await borrow.main({ action: 'return', payload: { id: 't1', appearance: 'normal' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(mock.__store.tools[0].status, 'qualified');
});

// ───────────────────────── maintenance：报修 / 审批 / 复检（M7） ─────────────────────────
test('maintenance.report: 生成待审批报修单且器具转 maintaining', async () => {
  mock.__store.tools = [{ _id: 't1', status: 'qualified' }];
  const r = await maintenance.main({ action: 'report', payload: { toolId: 't1', fault: '异响' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'pending');
  assert.strictEqual(mock.__store.repair_records[0].status, 'pending');
  assert.strictEqual(mock.__store.tools[0].status, 'maintaining');
});

test('maintenance.approve: 非授权角色被拒（403）', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.repair_records = [{ _id: 'r1', status: 'pending' }];
  const r = await maintenance.main({ action: 'approve', payload: { id: 'r1', approve: true } });
  assert.strictEqual(r.code, 403);
});

test('maintenance.approve: 授权角色批准 → approved', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', status: 'active' }];
  mock.__store.repair_records = [{ _id: 'r1', status: 'pending' }];
  const r = await maintenance.main({ action: 'approve', payload: { id: 'r1', approve: true } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'approved');
  assert.strictEqual(mock.__store.repair_records[0].status, 'approved');
});

test('maintenance.recheck: 复检合格 → done 且器具回 qualified', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', status: 'active' }];
  mock.__store.repair_records = [{ _id: 'r1', status: 'repaired', toolId: 't1' }];
  mock.__store.tools = [{ _id: 't1', status: 'maintaining' }];
  const r = await maintenance.main({ action: 'recheck', payload: { id: 'r1', pass: true } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'done');
  assert.strictEqual(mock.__store.tools[0].status, 'qualified');
});

// ───────────────────────── store：库房注册 / 入库（M3） ─────────────────────────
test('store.register: 缺名称被拒（400）', async () => {
  const r = await store.main({ action: 'register', payload: {} });
  assert.strictEqual(r.code, 400);
});

test('store.register: orgId 以服务端当前用户为准，忽略前端越权挂靠', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', orgId: 'oX', status: 'active' }];
  const r = await store.main({ action: 'register', payload: { name: 'A库房', orgId: 'oEVIL' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.orgId, 'oX'); // 服务端归属
  assert.notStrictEqual(r.data.orgId, 'oEVIL'); // 前端传入被忽略
});

test('store.inbound: 指定 toolId 后器具转为 qualified', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', orgId: 'oX', status: 'active' }];
  mock.__store.tools = [{ _id: 't1', status: 'in_use' }];
  const r = await store.main({ action: 'inbound', payload: { toolId: 't1', storeName: 'A库房' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(mock.__store.tools[0].status, 'qualified');
  assert.strictEqual(mock.__store.inbound_records.length, 1);
});

test('store.batchInbound: 批量写入入库记录', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', orgId: 'oX', status: 'active' }];
  mock.__store.tools = [
    { _id: 't1', name: '扳手', code: 'C1' },
    { _id: 't2', name: '锤子', code: 'C2' },
  ];
  const r = await store.main({ action: 'batchInbound', payload: { ids: ['t1', 't2'], storeName: 'A库房' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.count, 2);
  assert.strictEqual(mock.__store.inbound_records.length, 2);
});

// ───────────────────────── reconcile：账物核对（M1.4） ─────────────────────────
test('reconcile.createTask: 非管理角色被拒（403）', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'worker', status: 'active' }];
  const r = await reconcile.main({ action: 'createTask', payload: { month: '2026-07' } });
  assert.strictEqual(r.code, 403);
});

test('reconcile.createTask: 管理角色生成快照，同月重复建任务被拒（409）', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', status: 'active', orgId: 'oX' }];
  mock.__store.tools = [{ _id: 't1', code: 'C1', name: '扳手' }];
  const r1 = await reconcile.main({ action: 'createTask', payload: { month: '2026-07' } });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.items.length, 1);
  const r2 = await reconcile.main({ action: 'createTask', payload: { month: '2026-07' } });
  assert.strictEqual(r2.code, 409);
});

test('reconcile.confirmItem: 非管理角色被拒（403）', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.reconcile_tasks = [{ _id: 'tk1', items: [{ toolId: 't1', result: 'pending' }] }];
  const r = await reconcile.main({ action: 'confirmItem', payload: { id: 'tk1', itemId: 't1', result: 'loss' } });
  assert.strictEqual(r.code, 403);
});

test('reconcile.confirmItem: 管理角色更新逐项结果', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', status: 'active', orgId: 'oX' }];
  mock.__store.reconcile_tasks = [{ _id: 'tk1', items: [{ toolId: 't1', result: 'pending' }] }];
  const r = await reconcile.main({ action: 'confirmItem', payload: { id: 'tk1', itemId: 't1', result: 'loss' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.result, 'loss');
  assert.strictEqual(mock.__store.reconcile_tasks[0].items[0].result, 'loss');
});

test('reconcile.finishTask: 管理角色标记完成并统计差异', async () => {
  mock.__store.users = [{ openid: 'test_openid', role: 'lead', status: 'active', orgId: 'oX' }];
  mock.__store.reconcile_tasks = [{
    _id: 'tk1',
    items: [{ toolId: 't1', result: 'loss' }, { toolId: 't2', result: 'match' }],
  }];
  const r = await reconcile.main({ action: 'finishTask', payload: { id: 'tk1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'done');
  assert.strictEqual(r.data.diff, 1);
});
