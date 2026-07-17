// cloudfunctions/maintenance/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const collection = (name) => db.collection(name);
const c = collection;
const add = (name, data) => c(name).add({ data });
const getById = (name, id) => c(name).doc(id).get();
const update = (name, id, data) => c(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  c(name).where(filter).orderBy('createdAt', 'desc').limit(size).get();
const updateTool = (id, data) => c('tools').doc(id).update({ data });
module.exports = { collection, _, add, getById, update, listBy, updateTool };
