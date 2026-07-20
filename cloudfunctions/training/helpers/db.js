// cloudfunctions/training/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { subtreeIds, roleScope, allowedOrgIds, scopeFilter } = base;
const { getOpenid } = require('./user');
const c = collection;
const add = (name, data) => c(name).add({ data });
const getById = (name, id) => c(name).doc(id).get();
const update = (name, id, data) => c(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  c(name).where(filter).orderBy('createdAt', 'desc').limit(size).get();
const userByOpenid = (openid) => c('users').where({ openid }).get();
// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = base.getCurrentUser;
const listOrgs = (size = 200) => c('orgs').limit(size).get();

// ── RBAC 通用列表模板（写库带 orgId + 列表按组织子树收窄）──
async function scopedList(collName, filter = {}, opts = {}) {
  const me = await getCurrentUser(getOpenid());
  const orgs = (await listOrgs(500)).data || [];
  const where = { ...filter, ...scopeFilter(me, orgs, { orgId: opts.orgId, unitId: opts.unitId }) };
  return listBy(collName, where, opts.size || 50);
}

module.exports = {
  collection, _, add, getById, update, listBy, userByOpenid,
  getCurrentUser, listOrgs,
  subtreeIds, roleScope, allowedOrgIds, scopeFilter, scopedList,
};
