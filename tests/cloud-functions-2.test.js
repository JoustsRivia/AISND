'use strict';
// tests/cloud-functions-2.test.js
//
// 扩展单测覆盖（迭代建议 item 1）：borrow / maintenance / store / reconcile 四个核心云函数。
// 沿用同一 mock-cloud 拦截层，业务云函数（index.js + helpers）零改动，证明「换掉 wx-server-sdk 即可复用」。
//
// 运行：node --test tests/cloud-functions-2.test.js
// 依赖：仅 Node 内置（node:test / node:assert），无需安装依赖。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const borrow = require('../cloudfunctions/borrow/index');
const maintenance = require('../cloudfunctions/maintenance/index');
const store = require('../cloudfunctions/store/index');
const reconcile = require('../cloudfunctions/reconcile/index');
const file = require('../cloudfunctions/file/index');
const purchase = require('../cloudfunctions/purchase/index');
const tool = require('../cloudfunctions/tool/index');
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

// ───────────────────────── borrow：RBAC 数据范围（item 1） ─────────────────────────
test('borrow.records: 单位级角色按组织子树见全队领用记录，且忽略越权 orgId 下钻', async () => {
  mock.__store.orgs = [
    { _id: 'o1', parentId: null },
    { _id: 'o2', parentId: 'o1' },
    { _id: 'o3', parentId: 'o1' },
    { _id: 'oX', parentId: null },
  ];
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.borrow_records = [
    { _id: 'b1', orgId: 'o1', by: 'u_a', type: 'borrow' },
    { _id: 'b2', orgId: 'o2', by: 'u_b', type: 'borrow' },
    { _id: 'b3', orgId: 'o3', by: 'u_c', type: 'borrow' },
    { _id: 'b4', orgId: 'oX', by: 'u_d', type: 'borrow' },
  ];
  mock.__setOpenid('lead1');
  // 不带 orgId：默认看本人单位子树 o1/o2/o3（3 条）
  const r1 = await borrow.main({ action: 'records', payload: {} });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.length, 3);
  // 越权传入子树外的 orgId=oX 应被忽略，仍只返回本人子树（绝不泄漏 oX）
  const r2 = await borrow.main({ action: 'records', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r2.data.length, 3);
});

test('borrow.records: 普通用户仅见本人记录（领用记录不可越权可见）', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'o1', status: 'active' }];
  mock.__store.borrow_records = [
    { _id: 'b1', orgId: 'o1', by: 'w1', type: 'borrow' },
    { _id: 'b2', orgId: 'o1', by: 'other', type: 'borrow' },
  ];
  mock.__setOpenid('w1');
  const r = await borrow.main({ action: 'records', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'b1');
});

test('borrow.records: 全局角色看全量，且可主动下钻到指定组织子树', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'a1', role: 'admin', status: 'active' }];
  mock.__store.borrow_records = [
    { _id: 'b1', orgId: 'o1', by: 'u_a', type: 'borrow' },
    { _id: 'b2', orgId: 'oX', by: 'u_b', type: 'borrow' },
  ];
  mock.__setOpenid('a1');
  const r1 = await borrow.main({ action: 'records', payload: {} });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.length, 2); // 全局：全量
  const r2 = await borrow.main({ action: 'records', payload: { orgId: 'o1' } });
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r2.data.length, 1); // 主动下钻到 o1 子树
  assert.strictEqual(r2.data[0]._id, 'b1');
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

// ───────────────────────── store：入库记录 RBAC 数据范围（item 1） ─────────────────────────
test('store.records: 单位级角色按组织子树见全队入库记录，跨机构被拦截', async () => {
  mock.__store.orgs = [
    { _id: 'o1', parentId: null }, { _id: 'o2', parentId: 'o1' }, { _id: 'o3', parentId: 'o1' }, { _id: 'oX', parentId: null },
  ];
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.inbound_records = [
    { _id: 'i1', orgId: 'o1' }, { _id: 'i2', orgId: 'o2' }, { _id: 'i3', orgId: 'o3' }, { _id: 'iX', orgId: 'oX' },
  ];
  mock.__setOpenid('lead1');
  const r1 = await store.main({ action: 'records', payload: {} });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.length, 3); // o1/o2/o3
  const r2 = await store.main({ action: 'records', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.data.length, 3); // 越权下钻被忽略
});

test('store.records: 普通用户仅见本机构子树入库记录', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'oX', status: 'active' }];
  mock.__store.inbound_records = [{ _id: 'i1', orgId: 'oX' }, { _id: 'i2', orgId: 'o1' }];
  mock.__setOpenid('w1');
  const r = await store.main({ action: 'records', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'i1');
});

test('store.records: 全局角色看全量入库记录', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'a1', role: 'admin', status: 'active' }];
  mock.__store.inbound_records = [{ _id: 'i1', orgId: 'o1' }, { _id: 'i2', orgId: 'oX' }];
  mock.__setOpenid('a1');
  const r = await store.main({ action: 'records', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 2);
});

// ───────────────────────── maintenance：报修/计划 RBAC 数据范围（item 1） ─────────────────────────
test('maintenance.list: 单位级角色按组织子树见报修单，跨机构被拦截', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'o2', parentId: 'o1' }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'p1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.repair_records = [
    { _id: 'r1', orgId: 'o1', status: 'pending' }, { _id: 'r2', orgId: 'o2', status: 'pending' }, { _id: 'rX', orgId: 'oX', status: 'pending' },
  ];
  mock.__setOpenid('p1');
  const r1 = await maintenance.main({ action: 'list', payload: {} });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.length, 2); // o1/o2
  const r2 = await maintenance.main({ action: 'list', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.data.length, 2); // 越权下钻被忽略
});

test('maintenance.list: 普通用户仅见本机构报修单', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'oX', status: 'active' }];
  mock.__store.repair_records = [{ _id: 'r1', orgId: 'oX' }, { _id: 'r2', orgId: 'o1' }];
  mock.__setOpenid('w1');
  const r = await maintenance.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'r1');
});

test('maintenance.listPlan: 按组织子树收窄保养计划', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'p1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.maintenance_records = [{ _id: 'm1', type: 'plan', orgId: 'o1' }, { _id: 'mX', type: 'plan', orgId: 'oX' }];
  mock.__setOpenid('p1');
  const r = await maintenance.main({ action: 'listPlan', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'm1');
});

// ───────────────────────── purchase：采购单 RBAC 数据范围（item 1） ─────────────────────────
test('purchase.list: 单位级角色按组织子树见采购单，跨机构被拦截', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'o2', parentId: 'o1' }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'p1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.purchases = [
    { _id: 'pu1', orgId: 'o1', status: 'pending' }, { _id: 'pu2', orgId: 'o2', status: 'pending' }, { _id: 'puX', orgId: 'oX', status: 'pending' },
  ];
  mock.__setOpenid('p1');
  const r = await purchase.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 2); // o1/o2
  const r2 = await purchase.main({ action: 'list', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.data.length, 2); // 越权下钻被忽略
});

test('purchase.list: 普通用户仅见本机构采购单', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'oX', status: 'active' }];
  mock.__store.purchases = [{ _id: 'pu1', orgId: 'oX' }, { _id: 'pu2', orgId: 'o1' }];
  mock.__setOpenid('w1');
  const r = await purchase.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.data[0]._id, 'pu1');
});

// ───────────────────────── tool：台账 RBAC 数据范围（item 1，复用 scopeWhere） ─────────────────────────
test('tool.list: 单位级角色按组织子树见台账，跨机构被拦截', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'o2', parentId: 'o1' }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'p1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.tools = [
    { _id: 't1', orgId: 'o1', status: 'qualified' }, { _id: 't2', orgId: 'o2', status: 'qualified' }, { _id: 'tX', orgId: 'oX', status: 'qualified' },
  ];
  mock.__setOpenid('p1');
  const r = await tool.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.list.length, 2); // o1/o2
  const r2 = await tool.main({ action: 'list', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.data.list.length, 2); // 越权下钻被忽略
});

test('tool.list: 普通用户仅见本机构台账', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'oX', status: 'active' }];
  mock.__store.tools = [{ _id: 't1', orgId: 'oX' }, { _id: 't2', orgId: 'o1' }];
  mock.__setOpenid('w1');
  const r = await tool.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.list.length, 1);
  assert.strictEqual(r.data.list[0]._id, 't1');
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

// ───────────────────────── file：附件列表 RBAC 数据范围（item 1） ─────────────────────────
test('file.listFiles: 跨机构即使持有 refId 也被组织范围拦截', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.files = [
    { _id: 'f1', refId: 't1', orgId: 'o1' },
    { _id: 'f2', refId: 't1', orgId: 'o1' },
  ];
  // 机构 oX 用户试图用 refId=t1 越权查看 o1 的附件
  mock.__store.users = [{ openid: 'x1', role: 'worker', orgId: 'oX', status: 'active' }];
  mock.__setOpenid('x1');
  const r = await file.main({ action: 'listFiles', payload: { refId: 't1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 0); // 跨机构被拦截
});

test('file.listFiles: 本机构用户可见同机构 refId 附件', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }];
  mock.__store.files = [{ _id: 'f1', refId: 't1', orgId: 'o1' }];
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 'o1', status: 'active' }];
  mock.__setOpenid('w1');
  const r = await file.main({ action: 'listFiles', payload: { refId: 't1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 1);
});
