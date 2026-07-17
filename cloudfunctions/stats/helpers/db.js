// cloudfunctions/stats/helpers/db.js （隔离层：仅此处可调用 cloud.database()）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const coll = (name) => db.collection(name);
const countBy = (name, filter = {}) => coll(name).where(filter).count();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 有效期早于 N 天（expireAt 存为 YYYY-MM-DD）
const expiringSoon = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { expireAt: _.lte(ymd(d)) };
};
module.exports = { _, countBy, expiringSoon, coll };
