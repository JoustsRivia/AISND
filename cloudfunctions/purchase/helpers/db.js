// cloudfunctions/purchase/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { subtreeIds, roleScope, allowedOrgIds, scopeFilter } = base;
const c = collection;
const add = (name, data) => c(name).add({ data });
const getById = (name, id) => c(name).doc(id).get();
const update = (name, id, data) => c(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50, skip = 0) =>
  c(name).where(filter).orderBy('createdAt', 'desc').skip(skip).limit(size).get();
const countBy = (name, filter = {}) => c(name).where(filter).count();
// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = base.getCurrentUser;
const listOrgs = (size = 200) => c('orgs').limit(size).get();
module.exports = {
  collection, _, add, getById, update, listBy, countBy, getCurrentUser, listOrgs,
  // RBAC 数据范围原语（透出，供 index.js 复用，迁移零改动）
  subtreeIds, roleScope, allowedOrgIds, scopeFilter,
};
