// utils/auth.js
// 登录态、角色、权限判断与授权封装。只依赖 api.js 与 wx 基础能力，不触碰云开发 DB/云函数 API。
const api = require('./api');
const { ROLES } = require('./constants');

let _profile = null;

// 静默登录：拿 openid + 拉取/注册档案
async function ensureLogin() {
  if (_profile) return _profile;
  const profile = await api.login(); // 云函数 auth.login 内部用 helpers/user.js 取 openid
  _profile = profile || null;
  return _profile;
}

function getProfile() { return _profile; }

function setProfile(p) { _profile = p; }

// 是否已真正登录（auto 建档默认 bound:false，须完成注册/绑定才算登录）
function isLoggedIn() {
  return !!(_profile && _profile.bound);
}

// 登录守卫：未登录则跳转登录页，返回 false；已登录返回 true
function requireLogin() {
  if (!isLoggedIn()) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

// 退出登录：清空内存态；openid 静默登录机制下下次进入会重新拉取档案
function logout() {
  _profile = null;
  try { wx.removeStorageSync('profileCache'); } catch (e) {}
}

// 首次登录绑定角色/机构/账号（UI②）
async function bindAccount(data) {
  const profile = await api.bindAccount(data);
  _profile = profile || _profile;
  return _profile;
}

// 凭证登录（核对账号+密码，确认本 openid 已注册身份）
async function signin(data) {
  const profile = await api.signin(data);
  _profile = profile || _profile;
  return _profile;
}

function hasRole(role) {
  if (!_profile) return false;
  // 专班负责人拥有全部权限；其余按 role 精确匹配
  if (_profile.role === ROLES.LEAD) return true;
  return _profile.role === role;
}

function isLead() { return hasRole(ROLES.LEAD); }
function isSafety() { return _profile && (hasRole(ROLES.SAFETY_OFFICER) || hasRole(ROLES.PROJECT_LEAD)); }

// 操作级权限：结合角色与器具状态（如「合格且在有效期」才可领用）
// can(action, tool) 的判定规则集中在此，页面只调用结果。
function can(action, tool) {
  if (!_profile) return false;
  switch (action) {
    case 'borrow':
      return tool && tool.status === 'qualified' && !tool.expired;
    case 'scrap':
      return isSafety();
    case 'approve':
      return isLead() || isSafety();
    default:
      return true;
  }
}

// 位置授权（隐患上报用）
function ensureLocationAuth() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (s) => {
        if (s.authSetting['scope.userLocation']) return resolve(true);
        wx.authorize({
          scope: 'scope.userLocation',
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      },
      fail: () => resolve(false),
    });
  });
}

module.exports = {
  ensureLogin, getProfile, setProfile, bindAccount, signin, logout,
  isLoggedIn, requireLogin,
  hasRole, isLead, isSafety, can,
  ensureLocationAuth,
};
