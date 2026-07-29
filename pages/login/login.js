// pages/login/login.js —— 登录页（UI②）：凭证登录 / 注册绑定 + 三级级联角色选择
// 流程：静默取 openid（auth.ensureLogin 已建档 bound:false）→ 注册绑定角色，或凭证登录
const auth = require('../../utils/auth');
const api = require('../../utils/api');

Page({
  data: {
    mode: 'register',          // 'login' | 'register'
    // 级联选择器状态（注册模式）
    selRoleValue: '',
    selRoleName: '',
    selRoleMeta: null,
    isRoleComplete: false,
    matchedOrgId: '',
    matchedUnitId: '',
    orgLoading: false,
    // 表单
    username: '',
    nickname: '',
    password: '',
    showPwd: false,
    loading: false,
  },

  async onLoad() {
    await auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    this.setData({ mode: (p && p.bound) ? 'login' : 'register' });
  },

  // ── 级联选择器变化 ──
  onRolePick(e) {
    const { roleValue, roleName, roleMeta, isComplete } = e.detail;
    this.setData({
      selRoleValue: roleValue,
      selRoleName: roleName,
      selRoleMeta: roleMeta,
      isRoleComplete: isComplete,
      matchedOrgId: '',
      matchedUnitId: '',
    });
    if (isComplete && roleMeta) {
      this._autoMatchOrg(roleMeta);
    }
  },

  async _autoMatchOrg(roleMeta) {
    this.setData({ orgLoading: true });
    try {
      const orgTree = await api.getOrgTree().catch(() => []);
      if (!orgTree || !orgTree.length) { this.setData({ orgLoading: false }); return; }
      const byId = {};
      orgTree.forEach((o) => { byId[o._id] = o; });
      const unitKindMap = {
        safety: ['安监', '安全', 'safety'],
        contractor: ['总包', '公司', '建设', 'contractor'],
        subcontractor: ['分包', 'subcontractor'],
      };
      const orgKindMap = {
        unit: ['unit'],
        project: ['project', '项目部', '工程部'],
        team: ['team', '班组', '班'],
      };
      const unitKeywords = unitKindMap[roleMeta.unitType] || [];
      const orgKeywords = roleMeta.orgKind ? (orgKindMap[roleMeta.orgKind] || []) : [];
      const units = orgTree.filter((o) => o.level === 0 || o.kind === 'unit');
      let matchedUnit = null, matchedOrg = null;
      for (const u of units) {
        if (unitKeywords.some((kw) => (u.name || '').includes(kw) || (u.kind || '').includes(kw))) { matchedUnit = u; break; }
      }
      if (!matchedUnit) matchedUnit = orgTree.find((o) => o.level === 0);
      if (matchedUnit && orgKeywords.length) {
        const subtree = orgTree.filter((o) => {
          if (o._id === matchedUnit._id) return false;
          let p = o.parentId;
          while (p) { if (p === matchedUnit._id) return true; p = byId[p] ? byId[p].parentId : null; }
          return false;
        });
        matchedOrg = subtree.find((o) => orgKeywords.some((kw) => (o.kind || '').includes(kw) || (o.name || '').includes(kw)));
        if (!matchedOrg && subtree.length) {
          matchedOrg = subtree.find((o) =>
            roleMeta.orgKind === 'team' ? (o.kind === 'team' || o.level >= 2)
            : roleMeta.orgKind === 'project' ? (o.kind === 'project' || o.level === 1)
            : true
          ) || subtree[0];
        }
      }
      this.setData({
        matchedUnitId: matchedUnit ? matchedUnit._id : '',
        matchedOrgId: matchedOrg ? matchedOrg._id : (matchedUnit ? matchedUnit._id : ''),
        orgLoading: false,
      });
    } catch (_) { this.setData({ orgLoading: false }); }
  },

  onMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, password: '' }); },
  onUserInput(e) { this.setData({ username: e.detail.value }); },
  onNickInput(e) { this.setData({ nickname: e.detail.value }); },
  onPwdInput(e) { this.setData({ password: e.detail.value }); },
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

  validatePassword(p) {
    if (!p || p.length < 6) return '密码至少 6 位';
    if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return '密码需同时包含字母和数字';
    return null;
  },

  async onLogin() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return;
    }
    const pwErr = this.validatePassword(this.data.password);
    if (pwErr) { wx.showToast({ title: pwErr, icon: 'none' }); return; }
    this.setData({ loading: true });
    try {
      const profile = await auth.signin({ username: this.data.username, password: this.data.password });
      this._enter(profile);
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async onRegister() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return;
    }
    const pwErr = this.validatePassword(this.data.password);
    if (pwErr) { wx.showToast({ title: pwErr, icon: 'none' }); return; }
    if (!this.data.isRoleComplete || !this.data.selRoleValue) {
      wx.showToast({ title: '请选择完整角色（需选到具体岗位）', icon: 'none' }); return;
    }
    if (this.data.orgLoading) {
      wx.showToast({ title: '正在匹配组织架构，请稍候', icon: 'none' }); return;
    }
    this.setData({ loading: true });
    try {
      const profile = await api.register({
        role: this.data.selRoleValue,
        unitId: this.data.matchedUnitId,
        orgId: this.data.matchedOrgId,
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
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); },
});
