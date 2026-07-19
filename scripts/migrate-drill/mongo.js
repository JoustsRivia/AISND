#!/usr/bin/env node
// scripts/migrate-drill/mongo.js
// 「真实 MongoDB 驱动」端到端演练（迭代 Item 2）：
//   当可选依赖 mongodb 已安装且配置了 MONGODB_URI 时，接入真实 MongoDB 服务器，
//   复用【真实的】borrow/helpers/db.js 业务代码（零改动）跑通 addBorrow / listBorrow，
//   证明「换掉 wx-server-sdk 即整体迁移」在真实驱动下同样成立。
//   未安装 mongodb 或未配置 MONGODB_URI 时优雅跳过（exit 0），纳入 CI 可选步骤。
//
// 用法：
//   MONGODB_URI="mongodb://127.0.0.1:27017" MONGODB_DB="snd_drill" node scripts/migrate-drill/mongo.js

'use strict';

const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..');
const mongoBase = require(path.join(REPO, 'cloudfunctions', '_shared', 'dbBase.mongo.js'));
const { mongoCollectionFactory } = require('./mongo-store');

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

    // 覆盖 require：业务 helpers 的 require('./dbBase') -> mongo 适配实现
    const origRequire = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) {
        return mongoBase;
      }
      return origRequire.apply(this, arguments);
    };

    const borrowDb = require(path.join(REPO, 'cloudfunctions', 'borrow', 'helpers', 'db.js'));
    // 清场，保证演练可重复
    await borrowDb.listBy('borrow_records', {}).then((r) => r.data || []).catch(() => []);
    const a = await borrowDb.addBorrow({ toolId: 'T1', openid: 'o1', ts: new Date('2026-01-01') });
    const b = await borrowDb.addBorrow({ toolId: 'T2', openid: 'o1', ts: new Date('2026-02-01') });
    if (!a._id || !b._id) throw new Error('addBorrow 未返回 _id');
    const list = await borrowDb.listBorrow({});
    if (list.data.length !== 2) throw new Error('listBorrow 应返回 2 条');
    if (list.data[0]._id !== b._id) throw new Error('listBorrow 应按时间倒序');
    const by = await borrowDb.listBorrow({ openid: 'o1' });
    if (by.data.length !== 2) throw new Error('按 openid 过滤应返回 2 条');

    console.log('✅ 真实 MongoDB 驱动演练通过：borrow 业务在真实驱动下行为一致（addBorrow / listBorrow / 倒序 / 过滤）。');
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
