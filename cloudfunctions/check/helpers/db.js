// cloudfunctions/check/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
const c = collection;
const add = (name, data) => c(name).add({ data });
const getById = (name, id) => c(name).doc(id).get();
const update = (name, id, data) => c(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  c(name).where(filter).orderBy('createdAt', 'desc').limit(size).get();
// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = async (openid) => {
  const res = await collection('users').where({ openid }).get();
  return res.data && res.data[0];
};
module.exports = { collection, _, add, getById, update, listBy, getCurrentUser };
