// cloudfunctions/borrow/helpers/db.js （隔离层：仅此文件可调用 cloud.database() 等 wx-server-sdk 数据能力）
// ★ 隔离层：仅此文件可调用 cloud.database() 等 wx-server-sdk 数据能力。
// 迁移到自有服务器时，只重写本文件（改为 MySQL/MongoDB 客户端），业务 index.js 零改动。
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { subtreeIds, roleScope, allowedOrgIds } = base;

// ── users ──
const findUser = (openid) => collection('users').where({ openid }).get();
const addUser = (data) => collection('users').add({ data });
const updateUser = (openid, data) => collection('users').where({ openid }).update({ data });
const listUsers = (filter = {}) => collection('users').where(filter).get();

// ── tools（一物一档：内嵌 operations[] / testRecords[]） ──
const findTool = (id) => collection('tools').doc(id).get();
const addTool = (data) => collection('tools').add({ data });
const updateTool = (id, data) => collection('tools').doc(id).update({ data });
const listTools = (filter = {}, size = 50) => collection('tools').where(filter).limit(size).get();
const countTools = (filter = {}) => collection('tools').where(filter).count();

// ── borrow_records（独立集合，支撑领用归还列表） ──
const addBorrow = (data) => collection('borrow_records').add({ data });
const listBorrow = (filter = {}, size = 50) => collection('borrow_records').where(filter).limit(size).orderBy('ts', 'desc').get();

// ── repair_records（归还损坏时自动生成报修单，对接 M7 维修流程） ──
const addRepair = (data) => collection('repair_records').add({ data });

// ── scrap_records ──
const addScrap = (data) => collection('scrap_records').add({ data });
const updateScrap = (id, data) => collection('scrap_records').doc(id).update({ data });
const listScrap = (filter = {}) => collection('scrap_records').where(filter).get();

// ── 通用 ──
const regExp = (regexp, options = 'i') => db.RegExp({ regexp, options });
const getById = (name, id) => collection(name).doc(id).get();
const add = (name, data) => collection(name).add({ data });
const update = (name, id, data) => collection(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) => collection(name).where(filter).limit(size).get();

// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = base.getCurrentUser;
const listOrgs = (size = 200) => collection('orgs').limit(size).get();
module.exports = {
  collection, _, regExp, listOrgs,
  findUser, addUser, updateUser, listUsers,
  findTool, addTool, updateTool, listTools, countTools,
  addBorrow, listBorrow, addRepair,
  addScrap, updateScrap, listScrap,
  getById, add, update, listBy,
  getCurrentUser,
  // RBAC 数据范围原语（透出，供 index.js 复用，迁移零改动）
  subtreeIds, roleScope, allowedOrgIds,
};
