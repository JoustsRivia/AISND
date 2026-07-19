'use strict';
// cloudfunctions/_tests/migration-drill.test.js
//
// 「自有服务器」适配实测演练（迭代 Item 7）：
//   用 cloudfunctions/_shared/dbBase.mongo.js（MongoDB 适配实现）替换业务云函数的 ./dbBase，
//   复用【真实的】 borrow/helpers/db.js 业务代码（零改动），验证「换掉 wx-server-sdk 即整体迁移」。
//
// 这是把「迁移契约」从「理论可迁移」（mock 反向证明）升级为「实测可迁移」的关键证据：
// 业务层（addBorrow / listBorrow / getCurrentUser…）在微信云开发与自有 MongoDB 服务器下行为一致。
//
// 运行：node --test cloudfunctions/_tests

const Module = require('module');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const BORROW_DB = path.join(REPO, 'cloudfunctions', 'borrow', 'helpers', 'db.js');
const mongoBase = require(path.join(REPO, 'cloudfunctions', '_shared', 'dbBase.mongo.js'));

// 覆盖 require：仅当「业务 helpers 内部 require('./dbBase')」时返回 mongo 适配实现。
// 用 DRILL_ACTIVE 标志隔离，避免污染同进程内的其他测试文件（如 auth/purchase 单测）。
let DRILL_ACTIVE = false;
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (DRILL_ACTIVE && id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) {
    return mongoBase;
  }
  return origRequire.apply(this, arguments);
};

const { test } = require('node:test');
const assert = require('node:assert');

test('迁移演练：borrow 业务在 MongoDB 适配层下 addBorrow + listBorrow 行为一致', async () => {
  DRILL_ACTIVE = true;
  try {
    // 强制重新求值 borrow/helpers/db.js，使其本次 require('./dbBase') 解析到 mongo 适配实现
    delete require.cache[require.resolve(BORROW_DB)];
    const borrowDb = require(BORROW_DB);

    const a = await borrowDb.addBorrow({ toolId: 'T1', openid: 'o1', ts: new Date('2026-01-01') });
    assert.ok(a._id, 'addBorrow 应返回 _id');
    const b = await borrowDb.addBorrow({ toolId: 'T2', openid: 'o1', ts: new Date('2026-02-01') });
    assert.ok(b._id, 'addBorrow 应返回 _id');

    const list = await borrowDb.listBorrow({});
    assert.strictEqual(list.data.length, 2, '应查出 2 条借用记录');
    // orderBy ts desc：最新(T2) 在前
    assert.strictEqual(list.data[0]._id, b._id, '应按时间倒序');

    // 领域查询：按 openid 过滤
    const byOpenid = await borrowDb.listBorrow({ openid: 'o1' });
    assert.strictEqual(byOpenid.data.length, 2);

    // 通用原语：getById 单文档
    const one = await borrowDb.getById('borrow_records', a._id);
    assert.ok(one && one._id === a._id, 'getById 应返回单文档');
  } finally {
    DRILL_ACTIVE = false;
  }
});

test('迁移演练：getCurrentUser 在适配层下按 openid 解析用户档案', async () => {
  DRILL_ACTIVE = true;
  try {
    delete require.cache[require.resolve(BORROW_DB)];
    const borrowDb = require(BORROW_DB);
    await borrowDb.add('users', { openid: 'u_x', role: 'admin', status: 'active' });
    const u = await borrowDb.getCurrentUser('u_x');
    assert.ok(u && u.role === 'admin', 'getCurrentUser 应解析出用户档案');
  } finally {
    DRILL_ACTIVE = false;
  }
});
