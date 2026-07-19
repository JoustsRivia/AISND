// pages/register/register.js —— 独立注册页（UI② 注册分支拆分）
// 功能：角色/单位/机构级联选择 + 账号/口令绑定。复用 utils/api.register()，
// 后端无需任何改动（迁移契约：换服务器时只改 api.js，页面零改动）。
// 安全：role 仍受服务端 SELF_BINDABLE_ROLES 白名单约束，admin 不可自助注册。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES_BINDABLE, buildUnits } = require('../../utils/register-shared');

// 密码强度评分（0~4）：长度 / 大小写混用 / 含数字 / 含符号
function scorePwd(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
const PWD_LABELS = ['太弱', '偏弱', '中等', '较强', '很强'];
const PWD_COLORS = ['#e54d42', '#f37d37', '#f0a020', '#39b54a', '#1aad19'];

Page({
  data: {
    roles: ROLES_BINDABLE,
    roleIndex: 0,
    orgTree: [],
    units: [],
    unitIndex: 0,
    orgOptions: [],
    orgIndex: 0,
    username: '',
    nickname: '',
    password: '',
    loading: false,
    // 密码强度可视化
    pwdStrength: 0,
    pwdLabel: '',
    pwdColor: '#e54d42',
    // 注册成功角色说明弹窗
    showSuccess: false,
    successRole: '',
    _profile: null,
  },

  async onLoad() {
    // 先静默建档（bound:false），再引导注册绑定
    await auth.ensureLogin().catch(() => {});
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

  onRoleChange(e) { this.setData({ roleIndex: +e.detail.value }); },
  onUnitChange(e) { this.setData({ unitIndex: +e.detail.value }, () => this.refreshOrgOptions()); },
  onOrgChange(e) { this.setData({ orgIndex: +e.detail.value }); },
  onUserInput(e) { this.setData({ username: e.detail.value }); },
  onNickInput(e) { this.setData({ nickname: e.detail.value }); },
  onPwdInput(e) {
    const pwd = e.detail.value;
    const s = scorePwd(pwd);
    this.setData({
      password: pwd,
      pwdStrength: s,
      pwdLabel: PWD_LABELS[s],
      pwdColor: PWD_COLORS[s],
    });
  },

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

  // 注册成功后展示「角色权限说明」弹窗，确认后再进入首页
  onEnter() {
    const profile = this.data._profile;
    if (profile) this._enter(profile);
  },

  async onRegister() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    if (this.data.pwdStrength < 2) {
      wx.showToast({ title: '密码强度不足，请加强', icon: 'none' });
      return;
    }
    const org = this.data.orgOptions[this.data.orgIndex];
    if (!org) {
      wx.showToast({ title: '请选择所属机构/班组', icon: 'none' });
      return;
    }
    const role = this.data.roles[this.data.roleIndex].value;
    const roleName = this.data.roles[this.data.roleIndex].name;
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
      this.setData({ loading: false, _profile: profile, successRole: roleName, showSuccess: true });
    } catch (err) {
      wx.showToast({ title: err.message || '注册失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  // 弹窗遮罩占位（阻止穿透到下层）
  noop() {},
});
