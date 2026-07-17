// cloudfunctions/warning/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const coll = (name) => db.collection(name);
const add = (name, data) => coll(name).add({ data });
const getById = (name, id) => coll(name).doc(id).get();
const update = (name, id, data) => coll(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  coll(name).where(filter).orderBy('createdAt', 'desc').limit(size).get();
module.exports = { _, add, getById, update, listBy, coll };
