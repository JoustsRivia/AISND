// cloudfunctions/stats/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const base = require('./dbBase');
const { cloud, db, _, collection } = base;
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

module.exports = { _, countBy, listBy, add, update, expiringSoon, coll, getUser };
