// pages/login/login.js —— 登录页（UI②）：凭证登录 / 注册绑定 + 单位→机构级联 + 角色权限说明
// 流程：静默取 openid（auth.ensureLogin 已建档 bound:false）→ 注册绑定角色/单位/机构，或凭证登录
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES_BINDABLE, buildUnits } = require('../../utils/register-shared');

Page({
  data: {
    mode: 'register',          // 'login' | 'register'
    roles: ROLES_BINDABLE,
    // 组织树（扁平）
    orgTree: [],
    units: [],                 // 单位（level 0）：总包企业 / 分包企业
    sel: null,                 // 级联选择器当前选择（role/unit/org），由 role-org-picker 派发
    username: '',
    nickname: '',
    password: '',
    showPwd: false,            // R04 密码明文/密文切换
    loading: false,
  },

  async onLoad() {
    // 已注册（bound）用户默认登录态，否则引导注册
    await auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    this.setData({ mode: (p && p.bound) ? 'login' : 'register' });
    this.loadOrgTree();
  },

  async loadOrgTree() {
    const tree = await api.getOrgTree().catch(() => []);
    const units = buildUnits(tree);
    this.setData({ orgTree: tree, units });
  },

  // 级联选择器变化：缓存完整选择，注册时直接拼装载荷
  onOrgPick(e) { this.setData({ sel: e.detail }); },

  onMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, password: '' }); },
  onUserInput(e) { this.setData({ username: e.detail.value }); },
  onNickInput(e) { this.setData({ nickname: e.detail.value }); },
  onPwdInput(e) { this.setData({ password: e.detail.value }); },

  // R04 密码显隐切换
  togglePwd() { this.setData({ showPwd: !this.data.showPwd }); },

  _enter(profile) {
    auth.setProfile(profile);
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.role = profile.role;
      app.globalData.orgId = profile.orgId;
      app.globalData.userInfo = profile;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  },

  // 凭证登录（已注册用户）
  async onLogin() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const profile = await auth.signin({ username: this.data.username, password: this.data.password });
      this._enter(profile);
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 注册并登录（首次绑定角色/单位/机构/账号）
  async onRegister() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    const sel = this.data.sel;
    if (!sel || !sel.orgId) {
      wx.showToast({ title: '请选择所属机构/班组', icon: 'none' });
      return;
    }
    const role = sel.roleValue;
    this.setData({ loading: true });
    try {
      const profile = await api.register({
        role,
        unitId: sel.unitId,
        orgId: sel.orgId,
        username: this.data.username,
        nickname: this.data.nickname || this.data.username,
        password: this.data.password,
      });
      this._enter(profile);
    } catch (err) {
      wx.showToast({ title: err.message || '注册失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onForgot() { wx.showToast({ title: '请联系系统管理员重置', icon: 'none' }); },

  // 跳转独立注册页（pages/register，复用 api.register 零改动后端）
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); },
});
