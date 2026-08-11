// utils/auth.js
// 登录态、角色、权限判断与授权封装。只依赖 api.js �? wx 基础能力，不触碰云开�? DB/云函�? API�?
const api = require('./api');
const { ROLES, ROLE_FAMILIES } = require('./constants');
const eventBus = require('./eventBus');

let _profile = null;

// ���� R12 �Ự�־û����󶨵�ǰ΢�����ݣ�����
// ��¼̬�� openid Ϊê��д�뱾�ش洢���������ɻָ�������� signin ���� openid У�飬
// �������˺������޷��ӹܣ�ȷ�����Ự == ��ǰ΢�����ݡ���
const SESSION_KEY = 'session';
function saveSession(p) {
  if (!p) return;
  try {
    wx.setStorageSync(SESSION_KEY, {
      openid: p.openid, role: p.role, username: p.username, nickname: p.nickname,
      profile: p,
    });
  } catch (e) { /* �洢�����ú��� */ }
}
function clearSession() {
  try { wx.removeStorageSync(SESSION_KEY); } catch (e) { /* ���� */ }
}
function loadSession() {
  try { return wx.getStorageSync(SESSION_KEY) || null; } catch (e) { return null; }
}

// 静默登录：拿 openid + 拉取/注册档案
async function ensureLogin() {
  if (_profile) return _profile;
  const session = loadSession();
  const profile = await api.login(); // 云函�? auth.login 内部�? helpers/user.js �? openid
  // ����˵������ȣ�����/�����쳣ʱ���˱��ػỰ����������������������ҳ���� requireServerLogin ���ˣ�
  _profile = profile || (session && session.profile) || null;
  saveSession(_profile);
  return _profile;
}

function getProfile() { return _profile; }

function setProfile(p) { _profile = p; saveSession(_profile); }

// ���� ��������㲥��Item 4����ɫ/��֯�����ʵʱˢ�� permission/profile ��ҳ�棩����
// ͬ���� app.globalData �����¼����߹㲥 'profile:changed'�����ķ��ݴ�ˢ�£�������ѯ��
function emitProfileChanged(profile) {
  const next = profile || _profile;
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.userInfo = next;
      app.globalData.role = (next && next.role) || null;
      app.globalData.orgId = (next && next.orgId) || null;
    }
  } catch (e) { /* getApp ��ĳЩʱ������δ���������� */ }
  eventBus.emit('profile:changed', next);
}

function onProfileChanged(cb) { return eventBus.on('profile:changed', cb); }
function offProfileChanged(cb) { eventBus.off('profile:changed', cb); }

// �ӷ����������ȡ�������㲥�������ҳ������ˢ�µ��ã�
async function refreshProfile() {
  try {
    const p = await api.getMyProfile();
    if (p) { _profile = p; saveSession(_profile); }
  } catch (e) { /* ��ȡʧ�ܱ������� */ }
  emitProfileChanged(_profile);
  return _profile;
}

// 是否已真正登录（auto 建档默认 bound:false，须完成注册/绑定才算登录�?
function isLoggedIn() {
  return !!(_profile && _profile.bound);
}

// 登录守卫：未登录则跳转登录页，返�? false；已登录返回 true
function requireLogin() {
  if (!isLoggedIn()) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

// 服务端校验登录态：调用 auth.getProfile 拉取云端档案，确认已绑定账号�?
// 用于敏感�? onLoad，避免仅依赖内存态（冷启�?/被清缓存时误判为已登录）�?
// 未登�?/档案不存在时跳转登录页并返回 false。成功则刷新内存态�?
async function requireServerLogin() {
  let profile = null;
  try {
    profile = await api.getMyProfile();
  } catch (e) {
    profile = null;
  }
  if (!profile || !profile.bound) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  _profile = profile;
  emitProfileChanged(_profile);
  return true;
}

// 退出登录：清空内存态；openid 静默登录机制下下次进入会重新拉取档案
function logout() {
  _profile = null;
  clearSession();
}

// 首次登录绑定角色/机构/账号（UI②）
async function bindAccount(data) {
  const profile = await api.bindAccount(data);
  _profile = profile || _profile;
  saveSession(_profile);
  emitProfileChanged(_profile);
  return _profile;
}

// 凭证登录（核对账�?+密码，确认本 openid 已注册身份）
async function signin(data) {
  const profile = await api.signin(data);
  _profile = profile || _profile;
  saveSession(_profile);
  emitProfileChanged(_profile);
  return _profile;
}

function hasRole(role) {
  if (!_profile) return false;
  // 仅小程序管理�?(admin)拥有全部权限；其余按 role 精确匹配
  if (_profile.role === ROLES.ADMIN) return true;
  return _profile.role === role;
}

// 管理族判定（词表统一 2026-08-08：与 shared/roles.js MGMT 同源语义）
function isLead() { return !!( _profile && (_profile.role === 'admin' || ROLE_FAMILIES.MGMT.includes(_profile.role))); }
// 安全员/安监判定：平台与总包安监 + 项目/单位级安全员 + 项目部负责人（原 safety_officer/project_lead 语义）
function isSafety() { return !!(_profile && ['a1', 'a2', 'b21', 'b22', 'c21', 'c22'].includes(_profile.role)); }

// 操作级权限：结合角色与器具状态（如「合格且在有效期」才可领用）
// can(action, tool) 的判定规则集中在此，页面只调用结果�?
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

// 位置授权（隐患上报用�?
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
  isLoggedIn, requireLogin, requireServerLogin,
  hasRole, isLead, isSafety, can,
  emitProfileChanged, onProfileChanged, offProfileChanged, refreshProfile,
  ensureLocationAuth,
};
