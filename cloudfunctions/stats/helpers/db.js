// cloudfunctions/stats/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { subtreeIds, roleScope, allowedOrgIds, scopeFilter } = base;
const { getOpenid } = require('./user');
const coll = collection;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 计数（缺集合/异常时稳返回 { total: 0 }，避免遍历崩溃）
const countBy = async (name, filter = {}) => {
  try {
    return await coll(name).where(filter || {}).count();
  } catch (e) {
    return { total: 0 };
  }
};

// 列表（limit 默认 100；异常时返回 { data: [] }）
const listBy = async (name, filter = {}, limit = 100) => {
  try {
    return await coll(name).where(filter || {}).limit(limit).get();
  } catch (e) {
    return { data: [] };
  }
};

const add = async (name, doc) => coll(name).add({ data: doc });

const update = async (name, id, doc) => coll(name).doc(id).update({ data: doc });

// 有效期早于 N 天（expireAt 存为 YYYY-MM-DD），days 缺省按 0 处理
const expiringSoon = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(days) ? days : 0));
  return { expireAt: _.lte(ymd(d)) };
};

// 按 openid 取当前用户（用于权限守卫）；查不到返回 null
const getUser = async (openid) => {
  if (!openid) return null;
  const r = await listBy('users', { openid }, 1);
  return (r && r.data && r.data[0]) || null;
};

// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = base.getCurrentUser;
const listOrgs = (size = 200) => coll('orgs').limit(size).get();

// ── RBAC 通用数据范围模板（Item 1：统计看板按组织子树收窄）──
// scopeWhere：仅返回范围片段（orgId in 子树 / {} / 空集），供多 countBy 合并场景复用，
//   全局角色返回 {}（看全量），其余返回按组织子树的 in 条件（越权下钻被忽略）。
async function scopeWhere(opts = {}) {
  const me = await getCurrentUser(getOpenid());
  const orgs = (await listOrgs(500)).data || [];
  return scopeFilter(me, orgs, { orgId: opts.orgId, unitId: opts.unitId });
}
// scopedList：按组织子树收窄的列表（合并业务过滤条件）
async function scopedList(collName, filter = {}, opts = {}) {
  const where = { ...filter, ...(await scopeWhere(opts)) };
  return listBy(collName, where, opts.size || 100);
}
// scopedCount：按组织子树收窄的计数（合并业务过滤条件）
async function scopedCount(collName, filter = {}, opts = {}) {
  const where = { ...filter, ...(await scopeWhere(opts)) };
  return countBy(collName, where);
}

module.exports = {
  _, countBy, listBy, add, update, expiringSoon, coll, getUser,
  getCurrentUser, listOrgs,
  // RBAC 数据范围原语 + 通用模板（透出，供 index.js 复用，迁移零改动）
  subtreeIds, roleScope, allowedOrgIds, scopeFilter, scopeWhere, scopedList, scopedCount,
};
