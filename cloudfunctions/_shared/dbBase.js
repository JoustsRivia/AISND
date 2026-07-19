// cloudfunctions/_shared/dbBase.js
// ★ 隔离层单一源（可迁移契约的核心）。
//
// 设计背景：微信云函数「逐函数独立部署」，跨函数 require 共享文件会在运行时失败
// （部署包只含函数自身目录）。故本文件作为「单一源」，由 scripts/bundle-db-base.js
// 在部署 / 测试前拷贝进每个 cloudfunctions/<fn>/helpers/dbBase.js，使各函数自包含。
//
// 迁移到自有服务器时：只重写本文件（把 cloud.database() 换成 MySQL/MongoDB 客户端
// 的 collection 工厂），19 份 helpers/db.js 的业务部分零改动。
//
// 本文件只暴露「与 wx-server-sdk 强耦合」的 4 个原语：cloud / db / _(command) / collection，
// 以及可直接复用的通用查询原语（regExp / getById / add / update / listBy）。
// 各函数的领域查询（findUser 等）保留在自身 db.js，便于按需定制排序 / 分页。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const collection = (name) => db.collection(name);

// ── 通用查询原语（可被各函数 helpers/db.js 直接复用，也可本地覆写以定制） ──
const regExp = (regexp, options = 'i') => db.RegExp({ regexp, options });
const getById = (name, id) => collection(name).doc(id).get();
const add = (name, data) => collection(name).add({ data });
const update = (name, id, data) => collection(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  collection(name).where(filter).limit(size).get();

// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导。
// 上提为单一源后，各函数 helpers/db.js 不再各自内联「查 users 表」逻辑。
const getCurrentUser = async (openid) => {
  const res = await collection('users').where({ openid }).get();
  return res.data && res.data[0];
};

module.exports = { cloud, db, _, collection, regExp, getById, add, update, listBy, getCurrentUser };
