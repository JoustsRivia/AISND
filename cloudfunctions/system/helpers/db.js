// cloudfunctions/system/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const coll = (name) => db.collection(name);
const add = (name, data) => coll(name).add({ data });
const getById = (name, id) => coll(name).doc(id).get();
const update = (name, id, data) => coll(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 100) =>
  coll(name).where(filter).limit(size).get();
// 读取当前用户档案（role/orgId/status），供服务端鉴权与数据范围推导
const getCurrentUser = async (openid) => {
  const res = await coll('users').where({ openid }).get();
  return res.data && res.data[0];
};
const listOrgs = (size = 200) => coll('orgs').limit(size).get();
const addOrg = (data) => coll('orgs').add({ data });
const remove = (name, id) => coll(name).doc(id).remove();
const removeOrg = (id) => coll('orgs').doc(id).remove();
const countBy = (name, filter = {}) => coll(name).where(filter).count();
module.exports = { _, add, getById, update, listBy, coll, collection: coll, getCurrentUser, listOrgs, addOrg, remove, removeOrg, countBy };
