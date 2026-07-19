// pages/register/register.js —— 独立注册页（UI② 注册分支拆分）
// 功能：角色/单位/机构级联选择 + 账号/口令绑定。复用 utils/api.register()，
// 后端无需任何改动（迁移契约：换服务器时只改 api.js，页面零改动）。
// 安全：role 仍受服务端 SELF_BINDABLE_ROLES 白名单约束，admin 不可自助注册。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES } = require('../../utils/constants');

// 与 cloudfunctions/auth register 服务端白名单一致的可自绑定角色
const ROLES_BINDABLE = [
  { value: ROLES.WORKER, name: '普通作业人员', desc: '仅可查看本班组工器具' },
  { value: ROLES.GROUP_LEAD, name: '班组长/班组安全员', desc: '仅可查看本班组工器具' },
  { value: ROLES.SAFETY_OFFICER, name: '项目部专职安全员', desc: '可管辖整个项目部台账' },
  { value: ROLES.LEASE_ADMIN, name: '租赁机具管理员', desc: '管理租赁机具台账' },
  { value: ROLES.LEAD, name: '专班负责人', desc: '全局台账与全部管理权限' },
  { value: ROLES.PROJECT_LEAD, name: '项目部负责人', desc: '可管辖整个项目部台账' },
  { value: ROLES.SUPERVISOR, name: '安监部管理人员', desc: '安监督查与系统管理' },
];

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
  },

  async onLoad() {
    // 先静默建档（bound:false），再引导注册绑定
    await auth.ensureLogin().catch(() => {});
    this.loadOrgTree();
  },

  async loadOrgTree() {
    const tree = await api.getOrgTree().catch(() => []);
    const byId = {};
    tree.forEach((o) => { byId[o._id] = o; });
    const units = tree.filter((o) => o.level === 0).map((u) => {
      const options = [];
      tree.forEach((o) => {
        if (o._id === u._id) return;
        let p = o.parentId, ok = false;
        while (p) { if (p === u._id) { ok = true; break; } p = byId[p] ? byId[p].parentId : null; }
        if (!ok) return;
        const path = [];
        let cur = o;
        while (cur) { path.unshift(cur.name); cur = byId[cur.parentId]; }
        options.push({ _id: o._id, label: path.join(' / '), unitId: u._id });
      });
      return { ...u, options };
    });
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

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },
});
