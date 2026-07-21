#!/usr/bin/env node
// scripts/migrate-drill/server.js
// 「换掉 dbBase.js 即整体迁移」端到端演练服务（零依赖，仅用 Node 内置 http）。
//
// 做法：覆盖 require，使 borrow 业务云函数内部的 require('./dbBase') 解析到
// shared/dbBase.mongo.js（MongoDB 适配实现），再挂载最小 HTTP 接口，
// 证明【真实的】borrow/helpers/db.js 业务代码在「自有服务器」环境下零改动即可运行。
//
// 用法：
//   node scripts/migrate-drill/server.js            # 监听 :3999
//   DRILL_PORT=8080 node scripts/migrate-drill/server.js
// 验证：
//   curl -XPOST localhost:3999/borrow -d '{"toolId":"T1","openid":"o1"}'
//   curl localhost:3999/borrow

'use strict';

const http = require('http');
const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..');
const mongoBase = require(path.join(REPO, 'shared', 'dbBase.mongo.js'));

// 覆盖 require：业务 helpers 的 require('./dbBase') -> mongo 适配实现
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) {
    return mongoBase;
  }
  return origRequire.apply(this, arguments);
};

const borrowDb = require(path.join(REPO, 'cloudfunctions', 'borrow', 'helpers', 'db.js'));

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.method === 'POST' && req.url === '/borrow') {
      const body = await readBody(req);
      const r = await borrowDb.addBorrow({ toolId: body.toolId, openid: body.openid, ts: new Date() });
      res.end(JSON.stringify({ ok: true, _id: r._id }));
    } else if (req.method === 'GET' && req.url === '/borrow') {
      const list = await borrowDb.listBorrow({});
      res.end(JSON.stringify({ ok: true, count: list.data.length, rows: list.data }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

const PORT = process.env.DRILL_PORT || 3999;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[migrate-drill] 监听 http://localhost:${PORT}`);
    console.log('[migrate-drill] borrow 业务已跑在 dbBase.mongo.js（MongoDB 适配层），证明「换掉 wx-server-sdk 即迁移」');
  });
}

module.exports = { server, borrowDb, mongoBase };
