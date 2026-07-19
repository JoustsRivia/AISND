'use strict';
// cloudfunctions/_tests/cloud-functions.test.js
//
// 云函数核心业务单测（node:test）。覆盖上次迭代建议 item 2 点名的三处高风险逻辑：
//   - auth：register/signin 越权守卫（禁止客户端伪造 admin 角色）
//   - purchase：approve pass=false → rejected 态流转（修复「驳回恒变通过」回归）
//   - scrap：autoCheck 待审/禁用候选识别 + judge 超期自动判定
//
// 运行：node --test cloudfunctions/_tests
// 依赖：仅 Node 内置（node:test / node:assert / node:crypto），无需安装依赖。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const auth = require('../auth/index');
const purchase = require('../purchase/index');
const scrap = require('../scrap/index');
const mock = require('./mock-cloud');

// 与 cloudfunctions/auth / system 同源的密码哈希（sha1 + 'tms_' 盐），用于断言口令已哈希
function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

// ───────────────────────── auth：注册 / 登录越权守卫 ─────────────────────────
test('auth.register: 拒绝越权角色 admin（403）', async () => {
  const r = await auth.main({ action: 'register', payload: { role: 'admin', orgId: 'o1', username: 'hack', password: 'x' } });
  assert.strictEqual(r.code, 403);
  assert.match(r.message, /角色不合法|需管理员分配/);
});

test('auth.register: 合法角色成功建档且口令被哈希（非明文）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', bound: false, orgId: '' }];
  const r = await auth.main({ action: 'register', payload: { role: 'worker', orgId: 'o1', username: 'alice', nickname: 'A', password: 'secret123' } });
  assert.strictEqual(r.code, 0);
  const u = mock.__store.users.find((x) => x.username === 'alice');
  assert.ok(u, '应在 users 集合写入用户');
  assert.strictEqual(u.password, hashPwd('secret123'));
  assert.notStrictEqual(u.password, 'secret123');
  assert.strictEqual(u.bound, true);
});

test('auth.register: 用户名重复被拒（409）', async () => {
  mock.__store.users = [
    { _id: 'u1', openid: 'other', username: 'alice', bound: true },
    { _id: 'u2', openid: 'test_openid', bound: false },
  ];
  const r = await auth.main({ action: 'register', payload: { role: 'worker', orgId: 'o1', username: 'alice', password: 'x' } });
  assert.strictEqual(r.code, 409);
});

test('auth.register: 缺少所属机构被拒（400）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', bound: false }];
  const r = await auth.main({ action: 'register', payload: { role: 'worker', orgId: '', username: 'bob', password: 'x' } });
  assert.strictEqual(r.code, 400);
});

test('auth.signin: 密码错误拒绝（401）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'x', username: 'bob', password: hashPwd('right'), bound: true }];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'wrong' } });
  assert.strictEqual(r.code, 401);
});

test('auth.signin: 凭证正确返回用户档案', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'x', username: 'bob', password: hashPwd('right'), bound: true, role: 'worker' }];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'right' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.username, 'bob');
});

// ───────────────────────── purchase：审批态流转 ─────────────────────────
test('purchase.approve: pass=false → rejected', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'project_lead', orgId: 'o1' }];
  mock.__store.purchases = [{ _id: 'p1', status: 'pending', name: '钳形表', qty: 2, orgId: 'o1' }];
  const r = await purchase.main({ action: 'approve', payload: { id: 'p1', pass: false, remark: '规格不符' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'rejected');
  assert.strictEqual(mock.__store.purchases[0].status, 'rejected');
});

test('purchase.approve: pass=true → approved', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'project_lead', orgId: 'o1' }];
  mock.__store.purchases = [{ _id: 'p1', status: 'pending', name: '钳形表', qty: 2, orgId: 'o1' }];
  const r = await purchase.main({ action: 'approve', payload: { id: 'p1', pass: true } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.status, 'approved');
});

test('purchase.approve: 非授权角色被拒（403）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', orgId: 'o1' }];
  mock.__store.purchases = [{ _id: 'p1', status: 'pending' }];
  const r = await purchase.main({ action: 'approve', payload: { id: 'p1', pass: true } });
  assert.strictEqual(r.code, 403);
});

test('purchase.create: 缺名称被拒（400）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'project_lead', orgId: 'o1' }];
  const r = await purchase.main({ action: 'create', payload: { qty: 2 } });
  assert.strictEqual(r.code, 400);
});

// ───────────────────────── scrap：自动判定 / 候选识别 ─────────────────────────
test('scrap.autoCheck: 返回 pending 记录 + forbidden 候选', async () => {
  mock.__store.scrap_records = [{ _id: 's1', status: 'pending', toolId: 't1' }];
  mock.__store.tools = [{ _id: 't1', code: 'C1', name: '绝缘手套', category: 'insulation', status: 'forbidden' }];
  const r = await scrap.main({ action: 'autoCheck' });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.pending.length, 1);
  assert.strictEqual(r.data.candidates.length, 1);
  assert.strictEqual(r.data.candidates[0]._id, 't1');
});

test('scrap.judge: 超过使用年限判定 mustScrap', async () => {
  const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 7); // 7 年前
  mock.__store.tools = [{ _id: 't1', code: 'C1', name: '绝缘手套', category: 'insulation', purchaseDate: old.toISOString(), status: 'qualified' }];
  const r = await scrap.main({ action: 'judge', payload: { id: 't1' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.mustScrap, true);
  assert.ok(r.data.reasons.some((x) => x.includes('使用年限')));
});

test('scrap.approve: 非授权角色被拒（403）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', role: 'worker', orgId: 'o1' }];
  mock.__store.scrap_records = [{ _id: 's1', status: 'pending', toolId: 't1' }];
  const r = await scrap.main({ action: 'approve', payload: { scrapId: 's1', approve: true } });
  assert.strictEqual(r.code, 403);
});
