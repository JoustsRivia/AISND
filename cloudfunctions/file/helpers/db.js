// cloudfunctions/file/helpers/db.js
// ★ 隔离层：仅此文件可调用 cloud.database() 等 wx-server-sdk 数据能力。
// 迁移到自有服务器时，只重写本文件（改为 MySQL/MongoDB 客户端），业务 index.js 零改动。
const base = require('./dbBase');
const { cloud, db, _, collection } = base;

// ── users ──
const findUser = (openid) => collection('users').where({ openid }).get();
const addUser = (data) => collection('users').add({ data });
const updateUser = (openid, data) => collection('users').where({ openid }).update({ data });
const listUsers = (filter = {}) => collection('users').where(filter).get();

// ── tools（一物一档：内嵌 operations[] / testRecords[]） ──
const findTool = (id) => collection('tools').doc(id).get();
const addTool = (data) => collection('tools').add({ data });
const updateTool = (id, data) => collection('tools').doc(id).update({ data });
const listTools = (filter = {}, size = 50) => collection('tools').where(filter).limit(size).get();
const countTools = (filter = {}) => collection('tools').where(filter).count();

// ── borrow_records（独立集合，支撑领用归还列表） ──
const addBorrow = (data) => collection('borrow_records').add({ data });
const listBorrow = (filter = {}, size = 50) => collection('borrow_records').where(filter).limit(size).orderBy('ts', 'desc').get();

// ── scrap_records ──
const addScrap = (data) => collection('scrap_records').add({ data });
const updateScrap = (id, data) => collection('scrap_records').doc(id).update({ data });
const listScrap = (filter = {}) => collection('scrap_records').where(filter).get();

// ── 通用 ──
const regExp = (regexp, options = 'i') => db.RegExp({ regexp, options });
const getById = (name, id) => collection(name).doc(id).get();
const add = (name, data) => collection(name).add({ data });
const update = (name, id, data) => collection(name).doc(id).update({ data });
const listBy = (name, filter = {}, size = 50) => collection(name).where(filter).limit(size).get();

module.exports = {
  collection, _, regExp,
  findUser, addUser, updateUser, listUsers,
  findTool, addTool, updateTool, listTools, countTools,
  addBorrow, listBorrow,
  addScrap, updateScrap, listScrap,
  getById, add, update, listBy,
};
