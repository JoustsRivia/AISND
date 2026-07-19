'use strict';
// cloudfunctions/_tests/mock-cloud.js
//
// 云函数单元测试 mock 层。作用：拦截任意云函数模块内部的 require('wx-server-sdk')，
// 返回内存态数据库 + 可注入的微信上下文，使业务云函数（index.js + helpers）能在 Node 下
// 脱离微信云开发环境直接运行单测。
//
// 关键点（可迁移契约）：本文件仅用于测试，位于 _tests 目录，不会被上传为云函数；
// 业务云函数的 index.js / helpers 代码保持零改动，证明「换掉 wx-server-sdk 即可复用」。

const Module = require('module');
const crypto = require('crypto');

// 内存数据库：collection 名 -> 文档数组
const store = Object.create(null);
let OPENID = 'test_openid';

// 查询操作符（对应 wx-server-sdk command）
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

// 文档匹配：支持等值与 command 操作符
function deepMatch(doc, where) {
  if (!where) return true;
  for (const k of Object.keys(where)) {
    const cond = where[k];
    const val = doc[k];
    if (cond && typeof cond === 'object' && cond.__op) {
      if (!matchOp(val, cond)) return false;
    } else if (val !== cond) {
      return false;
    }
  }
  return true;
}

function makeQuery(name) {
  let where = {};
  let docId = null;
  let orderBy = null;
  let skipN = 0;
  let limitN = 50;

  const q = {
    where(w) { where = w || {}; return q; },
    doc(id) { docId = id; return q; },
    orderBy(f, d) { orderBy = { f, d }; return q; },
    skip(n) { skipN = Number(n) || 0; return q; },
    limit(n) { limitN = Number(n) || 50; return q; },
    async get() {
      let rows = (store[name] || []).filter((r) => deepMatch(r, where));
      // 与 wx-server-sdk 一致：.doc(id).get() 返回单文档对象；.where().get() 返回数组
      if (docId != null) {
        rows = rows.filter((r) => String(r._id) === String(docId));
        return { data: rows[0] };
      }
      if (orderBy) {
        const { f, d } = orderBy;
        rows = [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (d === 'desc' ? -1 : 1));
      }
      return { data: rows.slice(skipN, skipN + limitN) };
    },
    async count() {
      let rows = (store[name] || []).filter((r) => deepMatch(r, where));
      if (docId != null) rows = rows.filter((r) => String(r._id) === String(docId));
      return { total: rows.length };
    },
    async add({ data }) {
      const _id = 'm_' + crypto.randomBytes(6).toString('hex');
      const row = { _id, ...data };
      (store[name] = store[name] || []).push(row);
      return { _id };
    },
    async update({ data }) {
      let rows = (store[name] || []).filter((r) => deepMatch(r, where));
      if (docId != null) rows = rows.filter((r) => String(r._id) === String(docId));
      let n = 0;
      for (const r of rows) { Object.assign(r, data); n++; }
      return { stats: { updated: n } };
    },
    async remove() {
      const all = store[name] || [];
      let n = 0;
      if (docId != null) {
        const idx = all.findIndex((r) => String(r._id) === String(docId));
        if (idx >= 0) { all.splice(idx, 1); n = 1; }
      } else {
        const keep = all.filter((r) => !deepMatch(r, where));
        n = all.length - keep.length;
        store[name] = keep;
      }
      return { stats: { removed: n } };
    },
  };
  return q;
}

const mockCloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database() {
    return {
      collection: (name) => makeQuery(name),
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
      RegExp: () => ({}),
      // 集合自愈（system 的 ensureCollection 调用），测试内存库无需真实建表
      createCollection: async () => ({ errMsg: 'ok' }),
    };
  },
  getWXContext() {
    return { OPENID, UNIONID: '', APPID: 'mock-appid', ENV: 'mock-env' };
  },
  // ── 测试辅助接口 ──
  __setOpenid(o) { OPENID = o; },
  __reset() { for (const k of Object.keys(store)) delete store[k]; },
  __store: store,
};

// 拦截：任何模块 require('wx-server-sdk') 都返回 mock（含 cloud function helpers 内部调用）
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'wx-server-sdk') return mockCloud;
  return origRequire.apply(this, arguments);
};

module.exports = mockCloud;
