// cloudfunctions/_shared/userBase.js
// ★ 隔离层「鉴权助手」单一源（与 dbBase.js 平行，同为隔离层唯一源）。
//
// 设计背景：微信云函数「逐函数独立部署」，跨函数 require 共享文件会在运行时失败
// （部署包只含函数自身目录）。故本文件作为「鉴权助手」唯一源，由
// scripts/bundle-db-base.js 在部署 / 测试前拷贝进每个 cloudfunctions/<fn>/helpers/userBase.js，
// 使各函数自包含、可独立部署。
//
// 迁移到自有服务器时：只重写本文件（把 cloud.getWXContext() 换成从请求头 / Token 解析身份），
// 19 份 helpers/user.js 仅做语义再导出，index.js 业务代码零改动。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ── 与 wx-server-sdk 强耦合的鉴权原语（单一源） ──
const getWXContext = () => cloud.getWXContext();

// 获取当前用户 openid
const getOpenid = () => getWXContext().OPENID;

// 解析微信用户信息
const getWXProfile = () => {
  const ctx = getWXContext();
  return { openid: ctx.OPENID, unionid: ctx.UNIONID, appid: ctx.APPID };
};

module.exports = { getOpenid, getWXProfile, getWXContext };
