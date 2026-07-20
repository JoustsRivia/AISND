// cloudfunctions/reconcile/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
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
// 分页全量拉取（避免 listBy 默认 limit 50/200 静默截断，账物核对需覆盖全部器具）
const listAll = async (name, filter = {}, size = 100) => {
  const COL = collection(name);
  const all = [];
  let skip = 0;
  // 防御上限，避免极端循环；单集合通常远小于此值
  const MAX = 50;
  for (let i = 0; i < MAX; i++) {
    const res = await COL.where(filter).limit(size).skip(skip).get();
    const data = (res && res.data) || [];
    all.push(...data);
    if (data.length < size) break;
    skip += size;
  }
  return all;
};
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
  collection, _, add, getById, update, listBy, listAll,
  getCurrentUser, listOrgs,
  subtreeIds, roleScope, allowedOrgIds, scopeFilter, scopedList,
};
