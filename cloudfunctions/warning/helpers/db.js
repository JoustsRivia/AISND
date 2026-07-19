// cloudfunctions/warning/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
const coll = collection;
const add = (name, data) => coll(name).add({ data });
const getById = (name, id) => coll(name).doc(id).get();
const update = (name, id, data) => coll(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  coll(name).where(filter).orderBy('createdAt', 'desc').limit(size).get();
module.exports = { _, add, getById, update, listBy, coll };
