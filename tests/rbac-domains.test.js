'use strict';
// tests/rbac-domains.test.js
//
// 迭代 Item 1（RBAC 注入剩余业务域闭环）：覆盖 cert / check / performance 三个读接口的
// 「按组织子树收窄」行为，验证 scopedList 通用模板在各域真正生效：
//   - 全局角色(admin/lead/supervisor)看全量
//   - 单位级角色(project_lead/safety_officer)看整单位子树
//   - 机构/班组级(worker)仅看本机构子树，且越权 orgId 下钻被忽略
//   - 写库带服务端 orgId（防止越权挂靠）
//
// 沿用 mock-cloud 拦截层，业务云函数（index.js + helpers）零改动，证明「换掉 wx-server-sdk 即可复用」。
// 运行：node --test tests

require('./mock-cloud'); // 必须在 require 业务云函数前安装 wx-server-sdk 拦截

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const cert = require('../cloudfunctions/cert/index');
const check = require('../cloudfunctions/check/index');
const performance = require('../cloudfunctions/performance/index');
const mock = require('./mock-cloud');

beforeEach(() => {
  mock.__reset();
  mock.__setOpenid('test_openid');
});

// 组织树：单位 u1 → 项目部 p1 → 班组 t1 / t2；另有独立单位 uX
const ORGS = [
  { _id: 'u1', parentId: '', level: 0 },
  { _id: 'p1', parentId: 'u1', level: 1 },
  { _id: 't1', parentId: 'p1', level: 2 },
  { _id: 't2', parentId: 'p1', level: 2 },
  { _id: 'uX', parentId: '', level: 0 },
];
function seedOrgs() { mock.__store.orgs = ORGS.map((o) => ({ ...o })); }

// ───────────────────────── cert：持证列表 RBAC ─────────────────────────
test('cert.list: 机构/班组级角色仅见本机构子树（含后代），不泄漏他机构', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 't1', status: 'active' }];
  mock.__store.certificates = [
    { _id: 'c1', orgId: 't1', type: 'welder', status: 'valid' },
    { _id: 'c2', orgId: 't2', type: 'hoist', status: 'valid' },   // t1 子树内的兄弟班组
    { _id: 'c3', orgId: 'u1', type: 'height', status: 'valid' },  // 不在 t1 子树
    { _id: 'cX', orgId: 'uX', type: 'other', status: 'valid' },   // 独立单位
  ];
  mock.__setOpenid('w1');
  const r = await cert.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  // worker@t1 仅见 t1/t2（同属 p1 子树？不，subtree(t1) = [t1]，t2 不在）→ 仅 c1
  const ids = (r.data || []).map((x) => x._id).sort();
  assert.deepStrictEqual(ids, ['c1']);
});

test('cert.list: 单位级角色看整单位子树（u1→p1→t1/t2）', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'u1', status: 'active' }];
  mock.__store.certificates = [
    { _id: 'c1', orgId: 't1', type: 'welder', status: 'valid' },
    { _id: 'c2', orgId: 't2', type: 'hoist', status: 'valid' },
    { _id: 'c3', orgId: 'u1', type: 'height', status: 'valid' },
    { _id: 'cX', orgId: 'uX', type: 'other', status: 'valid' },
  ];
  mock.__setOpenid('lead1');
  const r = await cert.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  const ids = (r.data || []).map((x) => x._id).sort();
  assert.deepStrictEqual(ids, ['c1', 'c2', 'c3']); // 整单位子树，不含独立单位 uX
});

test('cert.list: 全局角色看全量；可下钻任一组织子树', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'admin1', role: 'admin', orgId: 't1', status: 'active' }];
  mock.__store.certificates = [
    { _id: 'c1', orgId: 't1', type: 'welder', status: 'valid' },
    { _id: 'cX', orgId: 'uX', type: 'other', status: 'valid' },
  ];
  mock.__setOpenid('admin1');
  // 不带 orgId：全局看全量（2 条）
  const r1 = await cert.main({ action: 'list', payload: {} });
  assert.strictEqual(r1.data.length, 2);
  // 全局角色可下钻任一组织：传入 uX 仅返回 uX 子树（1 条）
  const r2 = await cert.main({ action: 'list', payload: { orgId: 'uX' } });
  assert.strictEqual(r2.data.length, 1);
  assert.strictEqual(r2.data[0]._id, 'cX');
});

test('cert.upsert: 写库带服务端 orgId（忽略前端传入，防挂靠）', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 't1', status: 'active' }];
  mock.__setOpenid('w1');
  const r = await cert.main({ action: 'upsert', payload: { type: 'welder', name: '焊工证', no: 'N1', expireAt: '2099-01-01', issuer: 'X', orgId: 'uX' } });
  assert.strictEqual(r.code, 0);
  const saved = mock.__store.certificates[0];
  assert.strictEqual(saved.orgId, 't1'); // 服务端归属，忽略前端 uX
});

// ───────────────────────── check：隐患/考核列表 RBAC ─────────────────────────
test('check.listHazard: 单位级角色看整单位子树，越权下钻忽略；写库带服务端 orgId', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'u1', status: 'active' }];
  mock.__store.hazards = [
    { _id: 'h1', orgId: 't1', status: 'open', reporter: 'a' },
    { _id: 'h2', orgId: 't2', status: 'open', reporter: 'b' },
    { _id: 'hX', orgId: 'uX', status: 'open', reporter: 'c' },
  ];
  mock.__setOpenid('lead1');
  const r = await check.main({ action: 'listHazard', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.data.map((x) => x._id).sort(), ['h1', 'h2']); // 整单位子树，不含 uX
  // 越权下钻 uX 被忽略，仍返回本子树（绝不泄漏 uX）
  const r2 = await check.main({ action: 'listHazard', payload: { orgId: 'uX' } });
  assert.deepStrictEqual(r2.data.map((x) => x._id).sort(), ['h1', 'h2']);
  // 写库带服务端 orgId（用户 orgId=u1，忽略前端传入的 uX）
  const rep = await check.main({ action: 'reportHazard', payload: { desc: '隐患', orgId: 'uX' } });
  assert.strictEqual(rep.code, 0);
  assert.strictEqual(mock.__store.hazards[mock.__store.hazards.length - 1].orgId, 'u1');
});

test('check.assessList: 单位级角色按组织子树收窄；assess 写库带服务端 orgId', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'lead1', role: 'project_lead', orgId: 'u1', status: 'active' }];
  mock.__store.assessments = [
    { _id: 'a1', orgId: 't1', score: 90 },
    { _id: 'a2', orgId: 't2', score: 80 },
    { _id: 'aX', orgId: 'uX', score: 70 },
  ];
  mock.__setOpenid('lead1');
  const r = await check.main({ action: 'assessList', payload: {} });
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(r.data.map((x) => x._id).sort(), ['a1', 'a2']);
  // 写库带服务端 orgId
  const s = await check.main({ action: 'assess', payload: { targetId: 'T', targetName: '被考核', score: 88 } });
  assert.strictEqual(s.code, 0);
  assert.strictEqual(mock.__store.assessments[mock.__store.assessments.length - 1].orgId, 'u1');
});

// ───────────────────────── performance：评分/排行/汇总 RBAC ─────────────────────────
test('performance.list: 机构级角色仅见本机构子树', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 't1', status: 'active' }];
  mock.__store.performance_scores = [
    { _id: 's1', orgId: 't1', personId: 'P1', month: '2026-07', score: 90 },
    { _id: 's2', orgId: 't2', personId: 'P2', month: '2026-07', score: 80 },
    { _id: 'sX', orgId: 'uX', personId: 'PX', month: '2026-07', score: 70 },
  ];
  mock.__setOpenid('w1');
  const r = await performance.main({ action: 'list', payload: {} });
  assert.strictEqual(r.code, 0);
  const ids = (r.data || []).map((x) => x._id);
  assert.deepStrictEqual(ids, ['s1']);
});

test('performance.rank/summary: 仅聚合本机构子树数据', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'w1', role: 'worker', orgId: 't1', status: 'active' }];
  mock.__store.performance_scores = [
    { _id: 's1', orgId: 't1', personId: 'P1', month: '2026-07', score: 100 },
    { _id: 's2', orgId: 't1', personId: 'P2', month: '2026-07', score: 80 },
    { _id: 'sX', orgId: 'uX', personId: 'PX', month: '2026-07', score: 50 },
  ];
  mock.__setOpenid('w1');
  const rank = await performance.main({ action: 'rank', payload: { month: '2026-07' } });
  assert.strictEqual(rank.code, 0);
  assert.strictEqual(rank.data.length, 2); // 仅 t1 的 2 条
  assert.strictEqual(rank.data[0].avg, 100); // 降序：P1 居首
  const sum = await performance.main({ action: 'summary', payload: { month: '2026-07' } });
  assert.strictEqual(sum.code, 0);
  assert.strictEqual(sum.data.scoreCount, 2); // 仅本机构
  assert.strictEqual(sum.data.avg, 90);       // (100+80)/2
});

test('performance.score/rewardAdd: 写库带服务端 orgId', async () => {
  seedOrgs();
  mock.__store.users = [{ openid: 'sup1', role: 'supervisor', orgId: 'u1', status: 'active' }];
  mock.__setOpenid('sup1');
  const s = await performance.main({ action: 'score', payload: { personId: 'P1', personName: '甲', score: 95 } });
  assert.strictEqual(s.code, 0);
  assert.strictEqual(mock.__store.performance_scores[mock.__store.performance_scores.length - 1].orgId, 'u1');
  const rw = await performance.main({ action: 'rewardAdd', payload: { personId: 'P1', personName: '甲', type: 'reward', reason: '优秀' } });
  assert.strictEqual(rw.code, 0);
  assert.strictEqual(mock.__store.performance_rewards[mock.__store.performance_rewards.length - 1].orgId, 'u1');
});
