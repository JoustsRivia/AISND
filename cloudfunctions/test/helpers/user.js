// cloudfunctions/test/helpers/user.js
// ★ 隔离层：仅此文件可调用 cloud.getWXContext() 等 wx-server-sdk 环境能力。
// （鉴权助手已上提至 _shared/userBase.js 单一源；本文件仅做语义再导出，便于 index.js 零改动引用）
const base = require('./userBase');
const { getOpenid, getWXProfile, getWXContext } = base;
module.exports = { getOpenid, getWXProfile, getWXContext };
