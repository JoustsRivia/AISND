#!/usr/bin/env node
// scripts/start-mongo-memory.js
// CI「真实 MongoDB 演练」辅助：启动 mongodb-memory-server，将连接 URI 写入
// /tmp/mongo-uri.txt 供后续步骤读取，随后常驻（CI 会在步骤结束时回收进程组）。
// 依赖（CI 已 npm install --no-save）：mongodb-memory-server。首次运行需下载 mongod 二进制（需网络）。
// 启动失败时退出 1，由 CI continue-on-error 兜底为优雅跳过。
//
// 用法：node scripts/start-mongo-memory.js

'use strict';

const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  fs.writeFileSync('/tmp/mongo-uri.txt', uri);
  console.log('MONGO_URI=' + uri);
  // 常驻，等待被 CI 回收（避免进程提前退出导致演练步骤连不上）
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error('⚠️  启动内存 MongoDB 失败（可能未安装依赖或无法下载二进制）：', e && e.message);
  process.exit(1);
});
