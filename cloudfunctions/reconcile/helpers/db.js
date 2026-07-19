// cloudfunctions/reconcile/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
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
const getCurrentUser = async (openid) => {
  const res = await collection('users').where({ openid }).get();
  return res.data && res.data[0];
};
module.exports = { collection, _, add, getById, update, listBy, listAll, getCurrentUser };
