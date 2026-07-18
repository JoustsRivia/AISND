// pages/login/login.js —— 登录页（UI②）：凭证登录 / 注册绑定 + 单位→机构级联 + 角色权限说明
// 流程：静默取 openid（auth.ensureLogin 已建档 bound:false）→ 注册绑定角色/单位/机构，或凭证登录
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLES } = require('../../utils/constants');

// 仅暴露「可自绑定」角色（与 cloudfunctions/auth register 服务端白名单一致）。
// 专班负责人 / 安监部管理人员权限极高，须由系统管理员分配。
// desc 说明数据范围（问题4 RBAC 的前端呈现）：绑到「班组」只看本班，绑到「项目部」看整个项目部。
const ROLES_BINDABLE = [
  { value: ROLES.WORKER, name: '普通作业人员', desc: '仅可查看本班组工器具' },
  { value: ROLES.GROUP_LEAD, name: '班组长/班组安全员', desc: '仅可查看本班组工器具' },
  { value: ROLES.SAFETY_OFFICER, name: '项目部专职安全员', desc: '可管辖整个项目部台账' },
  { value: ROLES.LEASE_ADMIN, name: '租赁机具管理员', desc: '管理租赁机具台账' },
];

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
    const byId = {};
    tree.forEach((o) => { byId[o._id] = o; });
    // 单位（level 0）
    const units = tree.filter((o) => o.level === 0).map((u) => {
      // 该单位下全部后代机构/班组，标签带路径
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

  // 初始化管理员账号（仅首次）：把当前微信身份设为安监部管理员 Jousts / qwer1234
  async onSeedAdmin() {
    const ok = await new Promise((resolve) => wx.showModal({
      title: '初始化管理员账号',
      content: '将把当前微信身份设为安监部管理员，账号 Jousts / 密码 qwer1234。仅首次可用，已存在管理员时将跳过。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    this.setData({ loading: true });
    try {
      await api.seedAdmin();
      wx.showToast({ title: '管理员已初始化：Jousts', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: err.message || '初始化失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
