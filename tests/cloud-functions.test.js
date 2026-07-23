'use strict';
// tests/cloud-functions.test.js
//
// 云函数核心业务单测（node:test）。覆盖上次迭代建议 item 2 点名的三处高风险逻辑：
//   - auth：register/signin 越权守卫（禁止客户端伪造 admin 角色）
//   - purchase：approve pass=false → rejected 态流转（修复「驳回恒变通过」回归）
//   - scrap：autoCheck 待审/禁用候选识别 + judge 超期自动判定
//
// 运行：node --test tests
// 依赖：仅 Node 内置（node:test / node:assert / node:crypto），无需安装依赖。

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const auth = require('../cloudfunctions/auth/index');
const purchase = require('../cloudfunctions/purchase/index');
const scrap = require('../cloudfunctions/scrap/index');
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

// R12：凭证严格对应账户。同库存在 bob 与 admin 两个账户时，用 bob 的账号密码登录，
// 返回的必须且只能是 bob 的档案，绝不能误登成 admin 或其他账户。
test('auth.signin: 凭证正确只返回对应账户档案，不会误登其他账户（R12）', async () => {
  mock.__store.users = [
    { _id: 'admin1', openid: 'x', username: 'admin', password: hashPwd('adminpwd'), bound: true, role: 'admin' },
    { _id: 'bob1', openid: 'x', username: 'bob', password: hashPwd('bobpwd'), bound: true, role: 'worker' },
  ];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'bobpwd' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.username, 'bob'); // 登录到的是凭证对应的 bob
  assert.notStrictEqual(r.data.username, 'admin'); // 不会误登成 admin
  assert.strictEqual(r.data._id, 'bob1');
});

test('auth.signin: 账号未绑定微信 → 首次登录绑定当前身份并返回档案', async () => {
  mock.__store.users = [{ _id: 'u1', openid: '', username: 'bob', password: hashPwd('right'), bound: true, role: 'worker' }];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'right' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.username, 'bob');
  assert.strictEqual(r.data.openid, 'test_openid'); // 已绑定到当前微信身份
});

test('auth.signin: 同一微信身份可正常登录自己的账号', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'test_openid', username: 'bob', password: hashPwd('right'), bound: true, role: 'worker' }];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'right' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.username, 'bob');
});

test('auth.signin: 账号已绑定其他微信身份也能登录并切换到当前身份（换设备/重装）', async () => {
  mock.__store.users = [{ _id: 'u1', openid: 'other_wechat', username: 'bob', password: hashPwd('right'), bound: true, role: 'worker' }];
  const r = await auth.main({ action: 'signin', payload: { username: 'bob', password: 'right' } });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.username, 'bob'); // 仍只返回凭证对应的 bob
  assert.strictEqual(r.data.openid, 'test_openid'); // 且把账号绑定到当前微信身份
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

// ───────────────────────── scrap：RBAC 数据范围（item 1） ─────────────────────────
test('scrap.list: 单位级角色按组织子树见待审报废，且忽略越权 orgId 下钻', async () => {
  mock.__store.orgs = [
    { _id: 'o1', parentId: null },
    { _id: 'o2', parentId: 'o1' },
    { _id: 'oX', parentId: null },
  ];
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'o1', status: 'active' }];
  mock.__store.scrap_records = [
    { _id: 's1', status: 'pending', orgId: 'o1', toolId: 't1' },
    { _id: 's2', status: 'pending', orgId: 'o2', toolId: 't2' },
    { _id: 's3', status: 'pending', orgId: 'oX', toolId: 't3' },
  ];
  mock.__setOpenid('lead1');
  const r1 = await scrap.main({ action: 'list', payload: {} });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.data.length, 2); // o1/o2 子树
  const r2 = await scrap.main({ action: 'list', payload: { orgId: 'oX' } });
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r2.data.length, 2); // 越权 oX 被忽略
});

test('scrap.list: 全局角色看全量待审报废', async () => {
  mock.__store.orgs = [{ _id: 'o1', parentId: null }, { _id: 'oX', parentId: null }];
  mock.__store.users = [{ openid: 'a1', role: 'admin', status: 'active' }];
  mock.__store.scrap_records = [
    { _id: 's1', status: 'pending', orgId: 'o1', toolId: 't1' },
    { _id: 's2', status: 'pending', orgId: 'oX', toolId: 't2' },
  ];
  mock.__setOpenid('a1');
  const r = await scrap.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.length, 2); // 全局：全量
});
