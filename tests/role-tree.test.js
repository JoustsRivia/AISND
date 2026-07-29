'use strict';
// tests/role-tree.test.js
// 三级级联角色树纯函数单测：验证 ROLE_TREE 数据结构完整性、级联查询、角色元数据映射。
// 运行：node --test tests/role-tree.test.js
// 依赖：仅 Node 内置（node:test / node:assert），无需任何外部依赖。

const { test } = require('node:test');
const assert = require('node:assert');

const {
  getRoleTree, getChildren, findNode, getRoleMeta,
  getRolePath, getLeafRoleCodes, isLeafRole,
} = require('../utils/role-tree');

// ─── 角色树结构完整性 ───
test('role-tree: getRoleTree 返回三级结构', () => {
  const tree = getRoleTree();
  assert.strictEqual(tree.length, 3, '一级应为 3 个节点（a/b/c）');
  assert.strictEqual(tree[0].value, 'a');
  assert.strictEqual(tree[1].value, 'b');
  assert.strictEqual(tree[2].value, 'c');
});

test('role-tree: 一级节点名称正确', () => {
  const tree = getRoleTree();
  assert.strictEqual(tree[0].name, '安监人员');
  assert.strictEqual(tree[1].name, '总包人员');
  assert.strictEqual(tree[2].name, '分包人员');
});

test('role-tree: a1/a2 无三级子节点', () => {
  const a1Children = getChildren('a1');
  const a2Children = getChildren('a2');
  assert.strictEqual(a1Children.length, 0);
  assert.strictEqual(a2Children.length, 0);
});

test('role-tree: b1 有两个三级子节点', () => {
  const children = getChildren('b1');
  assert.strictEqual(children.length, 2);
  assert.strictEqual(children[0].value, 'b11');
  assert.strictEqual(children[1].value, 'b12');
});

test('role-tree: b2 有四个三级子节点', () => {
  const children = getChildren('b2');
  assert.strictEqual(children.length, 4);
  assert.deepStrictEqual(children.map((c) => c.value), ['b21', 'b22', 'b23', 'b24']);
});

test('role-tree: c2 有四个三级子节点', () => {
  const children = getChildren('c2');
  assert.strictEqual(children.length, 4);
  assert.deepStrictEqual(children.map((c) => c.value), ['c21', 'c22', 'c23', 'c24']);
});

// ─── 级联查询 ───
test('role-tree: getChildren(null) 返回一级节点', () => {
  const c = getChildren(null);
  assert.strictEqual(c.length, 3);
  assert.deepStrictEqual(c.map((n) => n.value), ['a', 'b', 'c']);
});

test('role-tree: getChildren("a") 返回 a1/a2', () => {
  const c = getChildren('a');
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c.map((n) => n.value), ['a1', 'a2']);
});

test('role-tree: getChildren("b") 返回 b1/b2', () => {
  const c = getChildren('b');
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c.map((n) => n.value), ['b1', 'b2']);
});

test('role-tree: getChildren("nonexistent") 返回空数组', () => {
  const c = getChildren('nonexistent');
  assert.strictEqual(c.length, 0);
});

// ─── 节点查找 ───
test('role-tree: findNode 找到 c24', () => {
  const n = findNode(getRoleTree(), 'c24');
  assert.ok(n);
  assert.strictEqual(n.value, 'c24');
  assert.strictEqual(n.name, '分包作业人员');
  assert.strictEqual(n.orgKind, 'team');
  assert.strictEqual(n.unitType, 'subcontractor');
});

test('role-tree: findNode 找到 b11', () => {
  const n = findNode(getRoleTree(), 'b11');
  assert.ok(n);
  assert.strictEqual(n.name, '公司负责人');
  assert.strictEqual(n.orgKind, 'unit');
  assert.strictEqual(n.unitType, 'contractor');
});

test('role-tree: findNode 不存在的节点返回 null', () => {
  assert.strictEqual(findNode(getRoleTree(), 'z99'), null);
});

// ─── 角色元数据 ───
test('role-tree: getRoleMeta("c24") 返回完整元数据', () => {
  const meta = getRoleMeta('c24');
  assert.ok(meta);
  assert.strictEqual(meta.value, 'c24');
  assert.strictEqual(meta.name, '分包作业人员');
  assert.strictEqual(meta.unitType, 'subcontractor');
  assert.strictEqual(meta.orgKind, 'team');
  assert.deepStrictEqual(meta.path, ['分包人员', '分包现场工作人员', '分包作业人员']);
});

test('role-tree: getRoleMeta("a1") 正确（无三级）', () => {
  const meta = getRoleMeta('a1');
  assert.ok(meta);
  assert.strictEqual(meta.unitType, 'safety');
  assert.strictEqual(meta.orgKind, 'unit');
  assert.deepStrictEqual(meta.path, ['安监人员', '平台安监人员']);
});

test('role-tree: getRoleMeta("b21") 正确', () => {
  const meta = getRoleMeta('b21');
  assert.ok(meta);
  assert.strictEqual(meta.unitType, 'contractor');
  assert.strictEqual(meta.orgKind, 'project');
  assert.deepStrictEqual(meta.path, ['总包人员', '总包现场工作人员', '项目部负责人']);
});

// ─── 叶子角色识别 ───
test('role-tree: isLeafRole 正确识别叶子节点', () => {
  assert.strictEqual(isLeafRole('a1'), true);
  assert.strictEqual(isLeafRole('c24'), true);
  assert.strictEqual(isLeafRole('b23'), true);
  assert.strictEqual(isLeafRole('a'), false, 'a 不是叶子');
  assert.strictEqual(isLeafRole('b'), false, 'b 不是叶子');
  assert.strictEqual(isLeafRole('b1'), false, 'b1 不是叶子');
  assert.strictEqual(isLeafRole('c2'), false, 'c2 不是叶子');
});

// ─── 叶子角色码列表 ───
test('role-tree: getLeafRoleCodes 返回 14 个叶子角色', () => {
  const codes = getLeafRoleCodes();
  assert.strictEqual(codes.length, 14);
  assert.ok(codes.includes('a1'));
  assert.ok(codes.includes('a2'));
  assert.ok(codes.includes('b11'));
  assert.ok(codes.includes('b12'));
  assert.ok(codes.includes('b21'));
  assert.ok(codes.includes('b24'));
  assert.ok(codes.includes('c11'));
  assert.ok(codes.includes('c24'));
});

// ─── 角色路径 ───
test('role-tree: getRolePath("b24") 返回三级路径', () => {
  const path = getRolePath('b24');
  assert.ok(path);
  assert.strictEqual(path.length, 3);
  assert.strictEqual(path[0].value, 'b');
  assert.strictEqual(path[1].value, 'b2');
  assert.strictEqual(path[2].value, 'b24');
});

test('role-tree: getRolePath("a2") 返回两级路径', () => {
  const path = getRolePath('a2');
  assert.ok(path);
  assert.strictEqual(path.length, 2);
  assert.strictEqual(path[0].value, 'a');
  assert.strictEqual(path[1].value, 'a2');
});
