// cloudfunctions/_shared/dbBase.mongo.js
// ★ 隔离层「自有服务器」适配实现（与 dbBase.js 同接口的 MongoDB 版本）。
//
// 设计目的：把「迁移契约」从「理论可迁移」升级为「实测可迁移」。
//   生产：调用 setCollectionFactory((name) => mongoDb.collection(name)) 接入真实 mongodb 驱动；
//         该驱动返回的 Collection 只需实现本文件约定的少量方法（find/insertOne/...），
//         即可被下方查询原语复用，业务代码零改动。
//   演练/测试：默认使用内置内存集合（零依赖、可独立运行），由 cloudfunctions/_tests/migration-drill.test.js
//         与 scripts/migrate-drill/server.js 端到端验证。
//
// 关键：业务 helpers/db.js 与 index.js 不改一行，仅在「微信云开发」与「自有 MongoDB 服务器」之间
// 替换 ./dbBase 的解析目标（见 scripts/bundle-db-base.js 与 _tests 的 require 覆盖），即可整体迁移。

'use strict';

// ── 查询操作符（与 wx-server-sdk command 对齐）──
function matchOp(val, cond) {
  switch (cond.__op) {
    case 'eq': return val === cond.value;
    case 'neq': return val !== cond.value;
    case 'gt': return val > cond.value;
    case 'gte': return val >= cond.value;
    case 'lt': return val < cond.value;
    case 'lte': return val <= cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
    case 'nin': return !(Array.isArray(cond.value) && cond.value.includes(val));
    default: return true;
  }
}

// ── 内存集合实现（演练/测试用；生产可替换为 mongodb 驱动返回的同构集合）──
// 约定集合接口（与 mongodb Collection 最小交集）：
//   find(filter) -> Promise<doc[]>
//   insertOne(doc) -> Promise<{ insertedId }>
//   updateMany(filter, patch) -> Promise<{ modifiedCount }>
//   deleteMany(filter) -> Promise<{ deletedCount }>
//   countDocuments(filter) -> Promise<number>
function createMemoryCollection(store) {
  let seq = 0;
  const genId = () => 'm_' + (++seq).toString(36) + Date.now().toString(36);
  return {
    async find(filter) { return (store.items || []).filter((d) => matchDoc(d, filter)); },
    async insertOne(doc) {
      const _id = genId();
      store.items = store.items || [];
      const row = { _id, ...doc };
      store.items.push(row);
      return { insertedId: _id };
    },
    async updateMany(filter, patch) {
      let n = 0;
      for (const d of (store.items || [])) {
        if (matchDoc(d, filter)) { Object.assign(d, patch); n++; }
      }
      return { modifiedCount: n };
    },
    async deleteMany(filter) {
      const before = (store.items || []).length;
      store.items = (store.items || []).filter((d) => !matchDoc(d, filter));
      return { deletedCount: before - store.items.length };
    },
    async countDocuments(filter) { return (store.items || []).filter((d) => matchDoc(d, filter)).length; },
  };
}

// 单文档匹配：支持等值、命令操作符(__op)、正则(__regexp)
function matchDoc(doc, where) {
  if (!where || typeof where !== 'object') return true;
  for (const k of Object.keys(where)) {
    const cond = where[k];
    const val = doc[k];
    if (cond && typeof cond === 'object') {
      if (cond.__op) { if (!matchOp(val, cond)) return false; }
      else if (cond.__regexp) {
        if (typeof val !== 'string' || !new RegExp(cond.regexp, cond.options || 'i').test(val)) return false;
      } else if (val !== cond) return false;
    } else if (val !== cond) return false;
  }
  return true;
}

// 把「集合接口」适配为业务代码使用的查询 DSL（与 wx-server-sdk 链式调用同签名）
function makeQuery(collection) {
  const state = { where: {}, docId: null, orderBy: null, skipN: 0, limitN: 50 };
  const q = {
    where(w) { state.where = w || {}; return q; },
    doc(id) { state.docId = id; return q; },
    orderBy(f, d) { state.orderBy = { f, d }; return q; },
    skip(n) { state.skipN = Number(n) || 0; return q; },
    limit(n) { state.limitN = Number(n) || 50; return q; },
    async get() {
      let rows = await collection.find(state.where);
      if (state.docId != null) {
        rows = rows.filter((r) => String(r._id) === String(state.docId));
        return rows[0]; // 与 wx-server-sdk 一致：.doc(id).get() 返回单文档
      }
      if (state.orderBy) {
        const { f, d } = state.orderBy;
        rows = [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (d === 'desc' ? -1 : 1));
      }
      return { data: rows.slice(state.skipN, state.skipN + state.limitN) };
    },
    async count() {
      let rows = await collection.find(state.where);
      if (state.docId != null) rows = rows.filter((r) => String(r._id) === String(state.docId));
      return { total: rows.length };
    },
    async add({ data }) {
      const { insertedId } = await collection.insertOne(data);
      return { _id: insertedId };
    },
    async update({ data }) {
      const { modifiedCount } = await collection.updateMany(state.where, data);
      return { stats: { updated: modifiedCount } };
    },
    async remove() {
      const { deletedCount } = await collection.deleteMany(state.where);
      return { stats: { removed: deletedCount } };
    },
  };
  return q;
}

// ── 可替换的集合工厂（生产注入 mongodb 驱动，演练默认内存）──
let __factory = null;
const __memStore = Object.create(null); // name -> { items: [] }（默认内存库）
function setCollectionFactory(fn) { __factory = fn; }
function getCollection(name) {
  if (__factory) return __factory(name);
  __memStore[name] = __memStore[name] || { items: [] };
  return createMemoryCollection(__memStore[name]);
}

// ── 暴露与 dbBase.js 完全一致的原语（业务代码无感知切换）──
const cloud = { init() {} }; // 适配层无需微信上下文，提供占位以满足可能的引用
const db = {
  command: {
    eq: (v) => ({ __op: 'eq', value: v }),
    neq: (v) => ({ __op: 'neq', value: v }),
    gt: (v) => ({ __op: 'gt', value: v }),
    gte: (v) => ({ __op: 'gte', value: v }),
    lt: (v) => ({ __op: 'lt', value: v }),
    lte: (v) => ({ __op: 'lte', value: v }),
    in: (v) => ({ __op: 'in', value: v }),
    nin: (v) => ({ __op: 'nin', value: v }),
  },
  RegExp: (o) => ({ __regexp: true, regexp: o.regexp, options: o.options || 'i' }),
  createCollection: async () => ({ errMsg: 'ok' }),
};
const _ = db.command;
const collection = (name) => makeQuery(getCollection(name));

const regExp = (regexp, options = 'i') => db.RegExp({ regexp, options });
const getById = (name, id) => collection(name).doc(id).get();
const add = (name, data) => collection(name).add({ data });
const update = (name, id, data) => collection(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) => collection(name).where(filter).limit(size).get();

// 读取当前用户档案（与 dbBase.js 同源语义）
const getCurrentUser = async (openid) => {
  const res = await collection('users').where({ openid }).get();
  return res.data && res.data[0];
};

// ── RBAC 数据范围原语（与 dbBase.js 完全一致，纯函数，可被所有业务函数复用）──
const GLOBAL_ROLES = ['admin', 'lead', 'supervisor'];
const UNIT_ROLES = ['project_lead', 'safety_officer', 'lease_admin'];

// 组织子树推导：返回 rootId 及其全部后代 ID（含自身）
function subtreeIds(orgs, rootId) {
  if (!rootId || !Array.isArray(orgs) || !orgs.some((o) => o._id === rootId)) return [];
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const o of orgs) {
      if (o.parentId === cur && !ids.includes(o._id)) { ids.push(o._id); queue.push(o._id); }
    }
  }
  return ids;
}

// 角色 → 数据范围档位：'global' | 'unit' | 'org'
function roleScope(role) {
  if (GLOBAL_ROLES.includes(role)) return 'global';
  if (UNIT_ROLES.includes(role)) return 'unit';
  return 'org';
}

// 给定用户与全量组织，返回允许访问的 orgId 集合（含子树）。
// opts: { orgId, unitId } 可选下钻；若不在允许范围内则忽略（防越权）。
// 返回 null 表示「全量（不过滤）」；返回 ['__unbound__'] 表示「无可见数据」。
function allowedOrgIds(user, orgs, opts = {}) {
  if (!user) return ['__unbound__'];
  const scope = roleScope(user.role);
  if (scope === 'global') {
    if (opts.orgId || opts.unitId) {
      const ids = subtreeIds(orgs, opts.orgId || opts.unitId);
      return ids.length ? ids : ['__unbound__'];
    }
    return null;
  }
  const base = user.orgId ? subtreeIds(orgs, user.orgId) : [];
  if (!base.length) return ['__unbound__'];
  if (opts.orgId && base.includes(opts.orgId)) return subtreeIds(orgs, opts.orgId);
  return base;
}

module.exports = {
  cloud, db, _, collection, regExp, getById, add, update, listBy, getCurrentUser,
  // RBAC 数据范围原语（纯函数，业务函数按需复用，迁移零改动）
  GLOBAL_ROLES, UNIT_ROLES, subtreeIds, roleScope, allowedOrgIds,
  // 适配层专属：生产注入真实 mongodb 集合工厂
  setCollectionFactory,
};
