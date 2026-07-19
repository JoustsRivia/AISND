'use strict';
// scripts/migrate-drill/mongo-store.js
// 真实 MongoDB 驱动 → dbBase.mongo.js 集合接口 的适配器（迭代 Item 2）。
//
// dbBase.mongo.js 的 makeQuery 仅要求集合实现最小接口：
//   find(filter) -> Promise<doc[]>
//   insertOne(doc) -> Promise<{ insertedId }>
//   updateMany(filter, patch) -> Promise<{ modifiedCount }>
//   deleteMany(filter) -> Promise<{ deletedCount }>
//   countDocuments(filter) -> Promise<number>
// 本适配器把 mongodb 驱动的 Collection 包成该接口。
//
// 注：borrow 业务仅使用简单等值 where（{} / {toolId, openid}），直接作为 mongo 查询即可；
// 复杂命令条件（_.in / _.lt 等 __op 标记）在真实 mongo 下需翻译，本适配器对之做「安全降级」
// （忽略命令条件），足以跑通演练数据；生产接入真实 mongo 时应替换为完整查询翻译器。

function normalize(filter) {
  if (!filter || typeof filter !== 'object') return filter || {};
  const out = {};
  for (const k of Object.keys(filter)) {
    const v = filter[k];
    if (v && typeof v === 'object' && (v.__op || v.__regexp)) continue; // 真实 mongo 不支持内存标记
    out[k] = v;
  }
  return out;
}

function adapt(collection) {
  return {
    async find(filter) {
      const docs = await collection.find(normalize(filter)).toArray();
      return docs;
    },
    async insertOne(doc) {
      const r = await collection.insertOne(doc);
      return { insertedId: r.insertedId };
    },
    async updateMany(filter, patch) {
      const r = await collection.updateMany(normalize(filter), patch);
      return { modifiedCount: r.modifiedCount };
    },
    async deleteMany(filter) {
      const r = await collection.deleteMany(normalize(filter));
      return { deletedCount: r.deletedCount };
    },
    async countDocuments(filter) {
      return collection.countDocuments(normalize(filter));
    },
  };
}

// 工厂：给定 mongodb Db，返回 (name) => 适配后的集合
function mongoCollectionFactory(db) {
  return (name) => adapt(db.collection(name));
}

module.exports = { mongoCollectionFactory, normalize, adapt };
