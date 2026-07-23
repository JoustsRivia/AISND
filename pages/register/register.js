// pages/register/register.js —— 独立注册页（UI② 注册分支拆分）
// 功能：角色/单位/机构级联选择 + 账号/口令绑定。复用 utils/api.register()，
// 后端无需任何改动（迁移契约：换服务器时只改 api.js，页面零改动）。
// 安全：role 仍受服务端 SELF_BINDABLE_ROLES 白名单约束，admin 不可自助注册。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES_BINDABLE, ROLE_INFO, buildUnits } = require('../../utils/register-shared');

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
    orgTree: [],
    units: [],
    sel: null,                 // 级联选择器当前选择（role/unit/org），由 role-org-picker 派发
    username: '',
    nickname: '',
    password: '',
    showPwd: false,            // R04 密码明文/密文切换
    loading: false,
    // 密码强度可视化
    pwdStrength: 0,
    pwdLabel: '',
    pwdColor: '#e54d42',
    // 注册成功角色说明弹窗（迭代 Item 6：三段式结构化）
    showSuccess: false,
    successRole: '',
    successRoleValue: '',
    successInfo: null,         // ROLE_INFO[role]：数据范围 / 可用功能 / 审批链路
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
    this.setData({ orgTree: tree, units });
  },

  // 级联选择器变化：缓存完整选择，注册时直接拼装载荷
  onOrgPick(e) { this.setData({ sel: e.detail }); },

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
    const sel = this.data.sel;
    if (!sel || !sel.orgId) {
      wx.showToast({ title: '请选择所属机构/班组', icon: 'none' });
      return;
    }
    const role = sel.roleValue;
    const roleName = sel.roleName;
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
      this.setData({
        loading: false,
        _profile: profile,
        successRole: roleName,
        successRoleValue: role,
        successInfo: ROLE_INFO[role] || null,
        showSuccess: true,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '注册失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  // 查看完整权限说明（跳转常驻权限页）
  goPermission() {
    const role = this.data.successRoleValue;
    wx.navigateTo({ url: '/pages/permission/permission?role=' + encodeURIComponent(role || '') });
  },

  // 弹窗遮罩占位（阻止穿透到下层）
  noop() {},
});
