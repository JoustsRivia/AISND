// cloudfunctions/site/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
const c = collection;
const add = (name, data) => c(name).add({ data });
const getById = (name, id) => c(name).doc(id).get();
const update = (name, id, data) => c(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) =>
  c(name).where(filter).orderBy('ts', 'desc').limit(size).get();
const listByIds = (name, ids) => c(name).where({ _id: _.in(ids) }).limit(50).get();
const getTool = (id) => c('tools').doc(id).get();
module.exports = { collection, _, add, getById, update, listBy, listByIds, getTool };
