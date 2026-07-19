// cloudfunctions/cert/helpers/db.js
// ★ 隔离层：仅此文件可调用 cloud.database() 等 wx-server-sdk 数据能力。
// 迁移到自有服务器时，只重写本文件（改为 MySQL/MongoDB 客户端），业务 index.js 零改动。
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { subtreeIds, roleScope, allowedOrgIds, scopeFilter } = base;
const { getOpenid } = require('./user');

// ── users ──
const findUser = (openid) => collection('users').where({ openid }).get();
const addUser = (data) => collection('users').add({ data });
const updateUser = (openid, data) => collection('users').where({ openid }).update({ data });
const listUsers = (filter = {}) => collection('users').where(filter).get();

// ── tools（一物一档：内嵌 operations[] / testRecords[]） ──
const findTool = (id) => collection('tools').doc(id).get();
const addTool = (data) => collection('tools').add({ data });
const updateTool = (id, data) => collection('tools').doc(id).update({ data });
const listTools = (filter = {}, size = 50, skip = 0) => collection('tools').where(filter).limit(size).skip(skip).get();
const countTools = (filter = {}) => collection('tools').where(filter).count();

// ── borrow_records（独立集合，支撑领用归还列表） ──
const addBorrow = (data) => collection('borrow_records').add({ data });
const listBorrow = (filter = {}, size = 50) => collection('borrow_records').where(filter).limit(size).orderBy('ts', 'desc').get();

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

// ── RBAC 通用列表模板（Item 1：写库带 orgId + 列表按组织子树收窄）──
// 消除各业务函数重复推导数据范围的样板：统一注入 scopeFilter（全局看全量 / 单位看整单位
// 子树 / 机构·班组看本机构子树；越权下钻被忽略），业务 index.js 仅传业务过滤条件即可。
async function scopedList(coll, filter = {}, opts = {}) {
  const me = await getCurrentUser(getOpenid());
  const orgs = (await listOrgs(500)).data || [];
  const where = { ...filter, ...scopeFilter(me, orgs, { orgId: opts.orgId, unitId: opts.unitId }) };
  const skip = opts.skip != null ? opts.skip : (opts.page || 0) * (opts.size || 50);
  return listBy(coll, where, opts.size || 50, skip);
}

module.exports = {
  collection, _, regExp, listOrgs,
  findUser, addUser, updateUser, listUsers,
  findTool, addTool, updateTool, listTools, countTools,
  addBorrow, listBorrow,
  addScrap, updateScrap, listScrap,
  getById, add, update, listBy,
  getCurrentUser,
  // RBAC 数据范围原语 + 通用列表模板（透出，供 index.js 复用，迁移零改动）
  subtreeIds, roleScope, allowedOrgIds, scopeFilter, scopedList,
};
