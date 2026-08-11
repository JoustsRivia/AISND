// pages/register/register.js —— 独立注册页（UI② 注册分支拆分）
// 功能：三级级联角色选择（cascading-role-picker）+ 账号/口令绑定。
// 角色选定后自动推导组织归属与权限树，无需手动选择单位/机构。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { getRoleMeta } = require('../../utils/role-tree');
const { ROLE_INFO } = require('../../utils/register-shared');

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
    // 级联选择器状态
    selRoleValue: '',          // 当前选中的角色码（如 'c24'）
    selRoleName: '',           // 当前选中的角色名
    selRoleMeta: null,         // 角色元数据 { unitType, orgKind, desc, path }
    isRoleComplete: false,     // 是否选到叶子节点

    // 自动匹配的组织节点
    matchedOrgId: '',
    matchedUnitId: '',
    orgLoading: false,

    username: '',
    nickname: '',
    password: '',
    showPwd: false,
    loading: false,

    // 密码强度可视化
    pwdStrength: 0,
    pwdLabel: '',
    pwdColor: '#e54d42',

    // 注册成功角色说明弹窗
    showSuccess: false,
    successRole: '',
    successRoleValue: '',
    successInfo: null,
    _profile: null,
  },

  async onLoad() {
    await auth.ensureLogin().catch(() => {});
  },

  // ── 级联选择器变化 ──
  onRolePick(e) {
    const { roleValue, roleName, roleMeta, isComplete } = e.detail;
    this.setData({
      selRoleValue: roleValue,
      selRoleName: roleName,
      selRoleMeta: roleMeta,
      isRoleComplete: isComplete,
      // 角色变化时清除之前匹配的组织
      matchedOrgId: '',
      matchedUnitId: '',
    });
    // 选到叶子节点后，自动匹配组织
    if (isComplete && roleMeta) {
      this._autoMatchOrg(roleMeta);
    }
  },

  // ── 根据角色元数据自动匹配组织树节点 ──
  async _autoMatchOrg(roleMeta) {
    this.setData({ orgLoading: true });
    try {
      const orgTree = await api.getOrgTree().catch(() => []);
      if (!orgTree || !orgTree.length) {
        this.setData({ orgLoading: false });
        return;
      }

      const byId = {};
      orgTree.forEach((o) => { byId[o._id] = o; });

      // 按 unitType 映射 org 节点的 kind 关键字
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

      // 匹配逻辑：找 level 0 单位节点中名称含 unitType 关键词的
      let matchedUnit = null;
      let matchedOrg = null;

      const units = orgTree.filter((o) => o.level === 0 || o.kind === 'unit');
      for (const u of units) {
        const nameMatch = unitKeywords.some((kw) => (u.name || '').includes(kw) || (u.kind || '').includes(kw));
        if (nameMatch || units.length === 1) {
          matchedUnit = u;
          break;
        }
      }
      // 回退：取第一个 level 0 节点
      if (!matchedUnit) {
        matchedUnit = orgTree.find((o) => o.level === 0);
      }

      // 单位级角色（orgKind='unit'）：直接绑定单位节点——单位子树内不存在 unit 类型节点，
      // 在子树中查找会回退到项目部节点，被服务端 ORG_KIND_MAP 校验拒绝（"所选组织节点与角色不匹配"）
      if (matchedUnit && roleMeta.orgKind === 'unit') {
        matchedOrg = matchedUnit;
      } else if (matchedUnit && orgKeywords.length) {
        const subtree = orgTree.filter((o) => {
          if (o._id === matchedUnit._id) return false;
          let p = o.parentId;
          while (p) {
            if (p === matchedUnit._id) return true;
            p = byId[p] ? byId[p].parentId : null;
          }
          return false;
        });
        for (const o of subtree) {
          const kindMatch = orgKeywords.some((kw) =>
            (o.kind || '').includes(kw) || (o.name || '').includes(kw)
          );
          if (kindMatch) { matchedOrg = o; break; }
        }
        // 回退：取匹配单位下的第一个后代
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
    } catch (_) {
      this.setData({ orgLoading: false });
    }
  },

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
    if (!this.data.isRoleComplete || !this.data.selRoleValue) {
      wx.showToast({ title: '请选择完整角色（需选到具体岗位）', icon: 'none' });
      return;
    }
    if (this.data.orgLoading) {
      wx.showToast({ title: '正在匹配组织架构，请稍候', icon: 'none' });
      return;
    }

    const role = this.data.selRoleValue;
    const roleName = this.data.selRoleName;
    const unitId = this.data.matchedUnitId;
    const orgId = this.data.matchedOrgId;

    this.setData({ loading: true });
    try {
      const profile = await api.register({
        role,
        unitId,
        orgId,
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

  goPermission() {
    const role = this.data.successRoleValue;
    wx.navigateTo({ url: '/pages/permission/permission?role=' + encodeURIComponent(role || '') });
  },

  noop() {},
});
