// cloudfunctions/system/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
const coll = collection;

// 确保集合存在（管理端 API，云函数内可用）。已存在时 createCollection 会报错，捕获即可。
// 解决「初始化管理员 / 恢复默认组织」因集合未建而 -502005 database collection not exists 的问题。
const ensureCollection = async (name) => {
  try { await db.createCollection(name); } catch (e) { /* 已存在或无需处理，忽略 */ }
  return true;
};
const add = (name, data) => coll(name).add({ data });
const getById = (name, id) => coll(name).doc(id).get();
const update = (name, id, data) => coll(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 100) =>
  coll(name).where(filter).limit(size).get();
// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = base.getCurrentUser;
const listOrgs = (size = 200) => coll('orgs').limit(size).get();
const addOrg = (data) => coll('orgs').add({ data });
const remove = (name, id) => coll(name).doc(id).remove();
const removeOrg = (id) => coll('orgs').doc(id).remove();
const countBy = (name, filter = {}) => coll(name).where(filter).count();
module.exports = { _, add, getById, update, listBy, coll, collection: coll, getCurrentUser, listOrgs, addOrg, remove, removeOrg, countBy, ensureCollection };
