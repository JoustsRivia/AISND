'use strict';
// tests/mongo-drill.test.js
//
// 验证「真实驱动工厂注入」机制（迭代 Item 2）：
//   通过 dbBase.mongo.js 的 setCollectionFactory 注入一个自定义集合工厂（模拟真实驱动），
//   复用【真实的】borrow/helpers/db.js 业务代码（零改动）跑通 addBorrow / listBorrow，
//   证明「换掉 wx-server-sdk 即整体迁移」的工厂注入路径可用。
//
//   真实 mongodb 驱动路径由 scripts/migrate-drill/mongo.js 在配置 MONGODB_URI 时跑通，
//   本测试无需安装 mongodb，仅验证「注入一个自定义集合工厂即可整体切换存储后端」这一关键机制。

const Module = require('module');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const mongoBase = require(path.join(REPO, 'shared', 'dbBase.mongo.js'));

// 内存集合工厂（模拟「真实驱动」），验证工厂注入路径
function makeMemFactory() {
  const store = Object.create(null);
  let seq = 0;
  const gen = () => 'x' + (++seq);
  const cmp = (val, cond) => {
    switch (cond.__op) {
      case 'eq': return val === cond.value;
      case 'lt': return val < cond.value;
      case 'gt': return val > cond.value;
      case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
      default: return true;
    }
  };
  const match = (doc, where) => {
    if (!where || typeof where !== 'object') return true;
    for (const k of Object.keys(where)) {
      const cond = where[k];
      const val = doc[k];
      if (cond && typeof cond === 'object' && cond.__op) { if (!cmp(val, cond)) return false; }
      else if (val !== cond) return false;
    }
    return true;
  };
  return (name) => {
    const items = (store[name] = store[name] || []);
    return {
      async find(filter) { return items.filter((d) => match(d, filter)); },
      async insertOne(doc) { const _id = gen(); items.push({ _id, ...doc }); return { insertedId: _id }; },
      async updateMany(filter, patch) { let n = 0; for (const d of items) if (match(d, filter)) { Object.assign(d, patch); n++; } return { modifiedCount: n }; },
      async deleteMany(filter) { const before = items.length; const keep = items.filter((d) => !match(d, filter)); store[name] = keep; return { deletedCount: before - keep.length }; },
      async countDocuments(filter) { return items.filter((d) => match(d, filter)).length; },
    };
  };
}

const { test } = require('node:test');
const assert = require('node:assert');

test('迁移演练：注入自定义集合工厂后 borrow 业务行为一致（真实驱动注入路径）', async () => {
  mongoBase.setCollectionFactory(makeMemFactory());
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) return mongoBase;
    return orig.apply(this, arguments);
  };
  try {
    const borrowDb = require(path.join(REPO, 'cloudfunctions', 'borrow', 'helpers', 'db.js'));
    const a = await borrowDb.addBorrow({ toolId: 'T1', openid: 'o1', ts: new Date('2026-01-01') });
    const b = await borrowDb.addBorrow({ toolId: 'T2', openid: 'o1', ts: new Date('2026-02-01') });
    assert.ok(a._id && b._id, 'addBorrow 应返回 _id');
    const list = await borrowDb.listBorrow({});
    assert.strictEqual(list.data.length, 2, '应查出 2 条借用记录');
    assert.strictEqual(list.data[0]._id, b._id, '应按时间倒序');
    const by = await borrowDb.listBorrow({ openid: 'o1' });
    assert.strictEqual(by.data.length, 2, '按 openid 过滤应返回 2 条');
  } finally {
    Module.prototype.require = orig;
    mongoBase.setCollectionFactory(null); // 复位为内存默认，避免影响同进程其他测试
  }
});
