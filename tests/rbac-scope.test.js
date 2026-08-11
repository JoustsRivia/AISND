'use strict';
// tests/rbac-scope.test.js
//
// 覆盖迭代 Item 7（RBAC 数据范围真正落地）的「共享数据范围原语」：
//   纯函数 subtreeIds / roleScope / allowedOrgIds（来自 _shared/dbBase.js 单一源）。
// 通过 dbBase.mongo.js 引用（不依赖 wx-server-sdk，可在 Node 直接运行），
// 与 dbBase.js 同源同构，验证「迁移契约」下 RBAC 原语行为一致。
//
// 运行：node --test tests

const { test } = require('node:test');
const assert = require('node:assert');
const base = require('../shared/dbBase.mongo.js');

// 组织树：单位 u1 → 项目部 p1 → 班组 t1 / t2
const ORGS = [
  { _id: 'u1', parentId: '', level: 0 },
  { _id: 'p1', parentId: 'u1', level: 1 },
  { _id: 't1', parentId: 'p1', level: 2 },
  { _id: 't2', parentId: 'p1', level: 2 },
];

test('subtreeIds: 含自身与全部后代', () => {
  assert.deepStrictEqual(base.subtreeIds(ORGS, 'u1').sort(), ['p1', 't1', 't2', 'u1']);
  assert.deepStrictEqual(base.subtreeIds(ORGS, 'p1').sort(), ['p1', 't1', 't2']);
  assert.deepStrictEqual(base.subtreeIds(ORGS, 't1'), ['t1']);
});

test('subtreeIds: 空根/无组织返回空', () => {
  assert.deepStrictEqual(base.subtreeIds(ORGS, ''), []);
  assert.deepStrictEqual(base.subtreeIds([], 'u1'), []);
});

// 词表统一（2026-08-08）：档位只认三级树码 + admin。
//   global = ['admin','a1']（a1 平台安监跨单位全量）
//   unit   = ['a2','b11','b12','c11','c12']（单位级管理，绑单位节点=整单位子树）
//   org    = 其余树码（b21~b24/c21~c24，绑节点子树=管辖范围）
test('roleScope: 三档角色映射（三级树码 + admin）', () => {
  assert.strictEqual(base.roleScope('admin'), 'global');
  assert.strictEqual(base.roleScope('a1'), 'global');
  assert.strictEqual(base.roleScope('a2'), 'unit');
  assert.strictEqual(base.roleScope('b11'), 'unit');
  assert.strictEqual(base.roleScope('b12'), 'unit');
  assert.strictEqual(base.roleScope('c11'), 'unit');
  assert.strictEqual(base.roleScope('c12'), 'unit');
  assert.strictEqual(base.roleScope('b21'), 'org');
  assert.strictEqual(base.roleScope('b22'), 'org');
  assert.strictEqual(base.roleScope('b23'), 'org');
  assert.strictEqual(base.roleScope('b24'), 'org');
  assert.strictEqual(base.roleScope('c21'), 'org');
  assert.strictEqual(base.roleScope('c24'), 'org');
});

test('allowedOrgIds: 全局角色（admin/a1）不过滤（null），可下钻子树', () => {
  const admin = { role: 'admin', orgId: 't2' };
  assert.strictEqual(base.allowedOrgIds(admin, ORGS), null); // 全量
  assert.deepStrictEqual(base.allowedOrgIds(admin, ORGS, { orgId: 'u1' }).sort(), ['p1', 't1', 't2', 'u1']);
  const a1 = { role: 'a1', orgId: '' };
  assert.strictEqual(base.allowedOrgIds(a1, ORGS), null); // 平台安监：全平台全量
});

test('allowedOrgIds: 单位级角色（绑单位节点）看整单位子树', () => {
  const head = { role: 'b11', orgId: 'u1' };
  assert.deepStrictEqual(base.allowedOrgIds(head, ORGS).sort(), ['p1', 't1', 't2', 'u1']);
});

test('allowedOrgIds: 项目部负责人（b21 绑项目部节点）看项目部子树', () => {
  const pl = { role: 'b21', orgId: 'p1' };
  assert.deepStrictEqual(base.allowedOrgIds(pl, ORGS).sort(), ['p1', 't1', 't2']);
});

test('allowedOrgIds: 机构/班组级仅看本机构子树', () => {
  const worker = { role: 'b24', orgId: 't1' };
  assert.deepStrictEqual(base.allowedOrgIds(worker, ORGS), ['t1']);
});

test('allowedOrgIds: 越权 orgId 被忽略（防越界），仅下钻范围内', () => {
  const worker = { role: 'b24', orgId: 't1' };
  // 请求 t2（不在 t1 子树）→ 忽略，回退本机构
  assert.deepStrictEqual(base.allowedOrgIds(worker, ORGS, { orgId: 't2' }), ['t1']);
  // 请求 t1（在范围内）→ 生效
  assert.deepStrictEqual(base.allowedOrgIds(worker, ORGS, { orgId: 't1' }), ['t1']);
});

test('allowedOrgIds: 未绑定机构 / 无用户 → 无可见数据', () => {
  assert.deepStrictEqual(base.allowedOrgIds({ role: 'b24', orgId: '' }, ORGS), ['__unbound__']);
  assert.deepStrictEqual(base.allowedOrgIds(null, ORGS), ['__unbound__']);
});
