// cloudfunctions/store/helpers/user.js
// ★ 隔离层：仅此文件可调用 cloud.getWXContext() 等 wx-server-sdk 环境能力。
// 迁移到自有服务器时，只重写本文件（改为从请求头/Token 解析身份），调用方无感知。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const getWXContext = () => cloud.getWXContext();

// 获取当前用户 openid
const getOpenid = () => getWXContext().OPENID;

// 解析微信用户信息
const getWXProfile = () => {
  const ctx = getWXContext();
  return { openid: ctx.OPENID, unionid: ctx.UNIONID, appid: ctx.APPID };
};

module.exports = { getOpenid, getWXProfile, getWXContext };
