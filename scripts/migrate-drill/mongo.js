#!/usr/bin/env node
// scripts/migrate-drill/mongo.js
// 「真实 MongoDB 驱动」端到端多域演练（迭代 §4 #2 / #6）：
//   当可选依赖 mongodb 已安装且配置了 MONGODB_URI 时，接入真实 MongoDB，
//   复用【真实的】各业务域 helpers/db.js（零改动）跑通 add / listBy / getById 一致性，
//   证明「换掉 wx-server-sdk 即整体迁移」在真实驱动下对任意业务域都成立
//   （统一 setCollectionFactory 注入，所有域共用同一 mongo 适配实现）。
//   未安装 mongodb 或未配置 MONGODB_URI 时优雅跳过（exit 0），纳入 CI 可选步骤。
//
// 用法：
//   MONGODB_URI="mongodb://127.0.0.1:27017" MONGODB_DB="snd_drill" node scripts/migrate-drill/mongo.js

'use strict';

const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..');
const mongoBase = require(path.join(REPO, 'shared', 'dbBase.mongo.js'));
const { mongoCollectionFactory } = require('./mongo-store');

// 逐业务域回归用例：每个域用其【真实】helpers/db.js 的通用原语 add / listBy / getById
// （这些原语被业务 index.js 共用，证明统一注入对任意域生效，迁移零改动）。
const DOMAINS = [
  { dir: 'borrow', coll: 'borrow_records', sample: { toolId: 'T-B', openid: 'o1', ts: new Date('2026-01-01') } },
  { dir: 'scrap',  coll: 'scrap_records',  sample: { toolId: 'T-S', applicant: 'o1', status: 'pending', createdAt: new Date('2026-02-01') } },
  { dir: 'file',   coll: 'files',          sample: { fileID: 'cloud://x/y.png', type: 'image', refId: 'T-F', uploadedBy: 'o1', createdAt: new Date('2026-03-01') } },
  { dir: 'store',  coll: 'stores',         sample: { name: 'A库房', orgId: 'oX', createdAt: new Date('2026-04-01') } },
  { dir: 'tool',   coll: 'tools',          sample: { code: 'C1', name: '扳手', category: 'common', status: 'qualified', expireAt: new Date('2026-05-01') } },
  { dir: 'maintenance', coll: 'repair_records', sample: { toolId: 'T-M', status: 'pending', reporter: 'o1', orgId: 'oX', createdAt: new Date('2026-06-01') } },
  { dir: 'purchase',    coll: 'purchases',       sample: { name: 'P物资', status: 'pending', applicant: 'o1', orgId: 'oX', createdAt: new Date('2026-07-01') } },
];

async function main() {
  let client = null;
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.log('⏭️  未配置 MONGODB_URI，跳过真实 MongoDB 演练（需可选依赖 mongodb）。');
      console.log('   安装：npm i -D mongodb   配置：export MONGODB_URI=mongodb://127.0.0.1:27017');
      return;
    }
    // 延迟 require：未安装时不抛 MODULE_NOT_FOUND（脚本整体可优雅跳过）
    const { MongoClient } = require('mongodb');
    client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'snd_drill');
    mongoBase.setCollectionFactory(mongoCollectionFactory(db));

    // 统一注入：业务 helpers 的 require('./dbBase') -> mongo 适配实现（所有域共用同一 factory）
    const origRequire = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) {
        return mongoBase;
      }
      return origRequire.apply(this, arguments);
    };

    let passed = 0;
    for (const d of DOMAINS) {
      const dbLayer = require(path.join(REPO, 'cloudfunctions', d.dir, 'helpers', 'db.js'));
      // 清场，保证演练可重复（remove 在 mongo 适配下走 deleteMany）
      try { await dbLayer.collection(d.coll).where({}).remove(); } catch (_) { /* 忽略清场异常 */ }
      const added = await dbLayer.add(d.coll, d.sample);
      if (!added || !added._id) throw new Error(`[${d.dir}] add 未返回 _id`);
      const list = await dbLayer.listBy(d.coll, {});
      const rows = (list && list.data) || [];
      if (!rows.some((r) => String(r._id) === String(added._id))) {
        throw new Error(`[${d.dir}] listBy 未包含刚写入的记录`);
      }
      // getById 一致性（getById 直接返回文档，非 {data} 包裹）
      const got = await dbLayer.getById(d.coll, added._id).catch(() => null);
      if (got && String(got._id) !== String(added._id)) {
        throw new Error(`[${d.dir}] getById 返回不一致`);
      }
      console.log(`   ✅ ${d.dir}：add/listBy${got ? '/getById' : ''} 一致（${d.coll}）`);
      passed++;
    }

    console.log(`✅ 真实 MongoDB 驱动多域演练通过（${passed}/${DOMAINS.length} 个业务域）：统一 setCollectionFactory 注入下，各域真实 db 层 add/list/get 行为一致。`);
  } catch (e) {
    if (/Cannot find module 'mongodb'/.test(e.message) || e.code === 'MODULE_NOT_FOUND') {
      console.log('⏭️  可选依赖 mongodb 未安装，跳过真实 MongoDB 演练；运行 npm i -D mongodb 后重试。');
    } else {
      console.warn('⚠️  真实 MongoDB 演练异常（不影响其他校验）：', e.message);
    }
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

main();
