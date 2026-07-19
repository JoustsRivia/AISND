// pages/login/login.js —— 登录页（UI②）：凭证登录 / 注册绑定 + 单位→机构级联 + 角色权限说明
// 流程：静默取 openid（auth.ensureLogin 已建档 bound:false）→ 注册绑定角色/单位/机构，或凭证登录
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES_BINDABLE, buildUnits } = require('../../utils/register-shared');

Page({
  data: {
    mode: 'register',          // 'login' | 'register'
    roles: ROLES_BINDABLE,
    roleIndex: 0,
    // 组织树（扁平）
    orgTree: [],
    units: [],                 // 单位（level 0）：总包企业 / 分包企业
    unitIndex: 0,
    orgOptions: [],            // 所选单位下的机构/班组（含路径）供二级 picker
    orgIndex: 0,
    username: '',
    nickname: '',
    password: '',
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
    this.setData({ orgTree: tree, units }, () => this.refreshOrgOptions());
  },

  refreshOrgOptions() {
    const { units, unitIndex } = this.data;
    const unit = units[unitIndex];
    this.setData({ orgOptions: unit ? unit.options : [], orgIndex: 0 });
  },

  onMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, password: '' }); },
  onRoleChange(e) { this.setData({ roleIndex: +e.detail.value }); },
  onUnitChange(e) { this.setData({ unitIndex: +e.detail.value }, () => this.refreshOrgOptions()); },
  onOrgChange(e) { this.setData({ orgIndex: +e.detail.value }); },
  onUserInput(e) { this.setData({ username: e.detail.value }); },
  onNickInput(e) { this.setData({ nickname: e.detail.value }); },
  onPwdInput(e) { this.setData({ password: e.detail.value }); },

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
    const org = this.data.orgOptions[this.data.orgIndex];
    if (!org) {
      wx.showToast({ title: '请选择所属机构/班组', icon: 'none' });
      return;
    }
    const role = this.data.roles[this.data.roleIndex].value;
    this.setData({ loading: true });
    try {
      const profile = await api.register({
        role,
        unitId: org.unitId,
        orgId: org._id,
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

  // 初始化管理员账号（仅首次）：将当前微信身份设为小程序管理员(admin)。
  // 凭证由后端 seed 逻辑持有，成功后从服务端返回中一次性展示，绝不写死在前端源码。
  async onSeedAdmin() {
    const ok = await new Promise((resolve) => wx.showModal({
      title: '初始化管理员账号',
      content: '将把当前微信身份设为小程序管理员（最高权限）。仅首次可用，已存在管理员时将跳过。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    this.setData({ loading: true });
    try {
      const res = await api.seedAdmin();
      const uname = (res && res.username) || '';
      const pwd = (res && res.password) || '';
      wx.showModal({
        title: '管理员已初始化',
        content: `账号：${uname}\n初始密码：${pwd}\n请妥善保存，并尽快在系统管理后台修改。`,
        showCancel: false,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '初始化失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
