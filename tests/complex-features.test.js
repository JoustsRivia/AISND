'use strict';
// tests/complex-features.test.js
//
// 复杂需求单测（node:test）。覆盖 R02/R09/R11/R13/R24/R25 关键逻辑。
// 运行：node --test tests/*.test.js
// 依赖：仅 Node 内置（node:test / node:assert / node:crypto），无需安装依赖。

require('./mock-cloud');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const auth = require('../cloudfunctions/auth/index');
const system = require('../cloudfunctions/system/index');
const tool = require('../cloudfunctions/tool/index');
const borrow = require('../cloudfunctions/borrow/index');
const scrap = require('../cloudfunctions/scrap/index');
const training = require('../cloudfunctions/training/index');
const { validateDateConstraints, calcExpireAt } = require('../utils/tool-schema');
const mock = require('./mock-cloud');

function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

// ───────────────────────── R02 工号生成 ─────────────────────────
test('R02: 注册时自动生成工号（单位级 4 位）', async () => {
  mock.__store.orgs = [{ _id: 'o1', name: '安装公司', parentId: '', level: 0, kind: 'unit' }];
  mock.__store.users = [{ _id: 'u0', openid: 'test_openid', role: 'worker', bound: false, orgId: '' }];
  const r = await auth.main({ action: 'register', payload: {
    role: 'worker', orgId: 'o1', username: 'alice', nickname: 'Alice', password: 'secret123',
  } });
  assert.strictEqual(r.code, 0);
  assert.ok(r.data.employeeId, '应有 employeeId');
  assert.strictEqual(r.data.employeeId.length, 4, '单位级工号应为 4 位');
  assert.match(r.data.employeeId, /^\d{4}$/);
});

test('R02: 班组级工号 8 位且同组织树内唯一自增', async () => {
  mock.__store.orgs = [
    { _id: 'o1', name: '安装公司', parentId: '', level: 0, kind: 'unit' },
    { _id: 'o2', name: '工程部', parentId: 'o1', level: 1, kind: 'project' },
    { _id: 'o3', name: '木工班', parentId: 'o2', level: 2, kind: 'team' },
  ];
  mock.__store.users = [
    { _id: 'u0', openid: 'test_openid', role: 'worker', bound: false, orgId: '' },
    { _id: 'u1', openid: 'other', username: 'existing', employeeId: '01010001', bound: true, orgId: 'o3' },
  ];
  const r = await auth.main({ action: 'register', payload: {
    role: 'worker', orgId: 'o3', username: 'bob', password: 'secret123',
  } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.employeeId, '01010002', '应自增为 01010002');
});

// ───────────────────────── R09 组织权限分发 ─────────────────────────
test('R09: admin 可获取全部编辑权限（editableIds=null）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'admin', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: '平台', parentId: '', level: 0 }];
  const r = await system.main({ action: 'orgPerm' });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.canEdit, true);
  assert.strictEqual(r.data.editableIds, null, 'admin 应全部可编辑');
});

test('R09: supervisor 只读（canEdit=false）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'supervisor', orgId: 'o1', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: '平台', parentId: '', level: 0 }];
  const r = await system.main({ action: 'orgPerm' });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.canEdit, false);
  assert.deepStrictEqual(r.data.editableIds, []);
});

test('R09: 非管理员调用 orgManage 被拒', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: '平台', parentId: '', level: 0 }];
  const r = await system.main({ action: 'org', payload: { op: 'add', data: { name: '新单位' } } });
  assert.strictEqual(r.code, 403);
});

// ───────────────────────── R11 跨组织隔离 ─────────────────────────
test('R11: tool.detail 非全局角色不可查看其他组织器具', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', orgId: 'o1', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: 'A单位', parentId: '', level: 0 }, { _id: 'o2', name: 'B单位', parentId: '', level: 0 }];
  mock.__store.tools = [{ _id: 't1', name: '手套', code: 'GL-26-GJ-0001', orgId: 'o2', status: 'qualified' }];
  const r = await tool.main({ action: 'detail', payload: { id: 't1' } });
  assert.strictEqual(r.code, 403);
  assert.match(r.message, /无权查看/);
});

test('R11: borrow 非全局角色不可领用其他组织器具', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', orgId: 'o1', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: 'A单位', parentId: '', level: 0 }, { _id: 'o2', name: 'B单位', parentId: '', level: 0 }];
  mock.__store.tools = [{ _id: 't1', name: '手套', code: 'C1', orgId: 'o2', status: 'qualified' }];
  const r = await borrow.main({ action: 'borrow', payload: { id: 't1' } });
  assert.strictEqual(r.code, 403);
  assert.match(r.message, /无权领用/);
});

test('R11: scrap.submit 非全局角色不可报废其他组织器具', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', orgId: 'o1', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: 'A单位', parentId: '', level: 0 }, { _id: 'o2', name: 'B单位', parentId: '', level: 0 }];
  mock.__store.tools = [{ _id: 't1', name: '手套', code: 'C1', orgId: 'o2', status: 'qualified' }];
  const r = await scrap.main({ action: 'submit', payload: { id: 't1', reason: 'test' } });
  assert.strictEqual(r.code, 403);
  assert.match(r.message, /无权报废/);
});

// ───────────────────────── R13 日期约束校验 ─────────────────────────
test('R13: validateDateConstraints 检验日期早于采购日期', () => {
  const err = validateDateConstraints({ purchaseDate: '2026-07-01', lastTestDate: '2026-06-01' });
  assert.ok(err, '应返回错误');
  assert.match(err, /检验日期不得早于采购日期/);
});

test('R13: validateDateConstraints 合法日期无错误', () => {
  const err = validateDateConstraints({ purchaseDate: '2026-01-01', lastTestDate: '2026-07-01', expireAt: '2027-01-01' });
  assert.strictEqual(err, null);
});

test('R13: calcExpireAt 根据检验周期计算截止日期', () => {
  const expire = calcExpireAt('2026-01-01', 6);
  assert.ok(expire, '应返回日期');
  assert.strictEqual(expire, '2026-07-01', '6 个月后应为 2026-07-01');
});

test('R13: tool.create 检验日期早于采购日期被拒（400）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  mock.__store.orgs = [{ _id: 'o1', name: 'A单位', parentId: '', level: 0 }];
  const r = await tool.main({ action: 'create', payload: {
    name: '测试器具', category: 'manual', orgId: 'o1',
    purchaseDate: '2026-07-01', lastTestDate: '2026-06-01',
  } });
  assert.strictEqual(r.code, 400);
  assert.match(r.message, /检验日期不得早于采购日期/);
});

// ───────────────────────── R24 消息字段富化 ─────────────────────────
test('R24: warning.generate 写入 toolCode/orgName/keeperName/refType', async () => {
  mock.__store.orgs = [{ _id: 'o1', name: '安装公司', parentId: '', level: 0 }];
  mock.__store.users = [{ _id: 'u1', openid: 'keeper1', nickname: '张三', role: 'worker', orgId: 'o1' }];
  mock.__store.tools = [{ _id: 't1', name: '手套', code: 'GL-26-GJ-0001', orgId: 'o1', expireAt: '2020-01-01', keeper: 'keeper1' }];
  const r = await require('../cloudfunctions/warning/index').main({ action: 'generate' });
  assert.strictEqual(r.code, 0);
  const w = mock.__store.warnings.find((x) => x.toolId === 't1');
  assert.ok(w, '应生成预警');
  assert.strictEqual(w.toolCode, 'GL-26-GJ-0001');
  assert.strictEqual(w.orgName, '安装公司');
  assert.strictEqual(w.keeperName, '张三');
  assert.ok(w.refType, '应有 refType');
});

// ───────────────────────── R25 培训增强 ─────────────────────────
test('R25: assign 支持多选人员（userIds[]）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'lead', orgId: 'o1', status: 'active' }];
  const r = await training.main({ action: 'assign', payload: {
    userIds: ['userA', 'userB'], courseId: 'c1', title: '安全培训',
  } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.count, 2);
  assert.strictEqual(mock.__store.training_records.length, 2);
});

test('R25: confirm 被指派人确认参训', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.training_records = [{ _id: 'tr1', userId: 'u1', courseId: 'c1', status: 'assigned', assignedOpenid: 'test_openid' }];
  const r = await training.main({ action: 'confirm', payload: { id: 'tr1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'confirmed');
  assert.strictEqual(mock.__store.training_records[0].status, 'confirmed');
});

test('R25: evaluate 参训人评分', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.training_records = [{ _id: 'tr1', userId: 'u1', courseId: 'c1', status: 'done' }];
  const r = await training.main({ action: 'evaluate', payload: { id: 'tr1', score: 85, comment: '内容实用' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.score, 85);
  assert.strictEqual(mock.__store.training_records[0].score, 85);
  assert.strictEqual(mock.__store.training_records[0].comment, '内容实用');
});

test('R25: evaluate 非参训人不可评价', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', status: 'active' }];
  mock.__store.training_records = [{ _id: 'tr1', userId: 'other', courseId: 'c1', status: 'done' }];
  const r = await training.main({ action: 'evaluate', payload: { id: 'tr1', score: 85 } });
  assert.strictEqual(r.code, 403);
});
