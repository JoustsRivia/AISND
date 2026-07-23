// pkg-system/pages/org/org.js —— M13 组织架构与用户管理（仅 supervisor/lead 可访问）
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');
const network = require('../../../utils/network');
const { ROLES } = require('../../../utils/constants');

// 可分配角色（与 cloudfunctions/system ROLE_WHITE 同源；lead/supervisor 仅由系统内置，不放进分配列表）
const ROLE_OPTIONS = [
  { value: ROLES.WORKER, name: '普通作业人员' },
  { value: ROLES.GROUP_LEAD, name: '班组长/班组安全员' },
  { value: ROLES.SAFETY_OFFICER, name: '项目部专职安全员' },
  { value: ROLES.LEASE_ADMIN, name: '租赁机具管理员' },
  { value: ROLES.PROJECT_LEAD, name: '项目部负责人' },
  { value: ROLES.ADMIN, name: '小程序管理员（最高权限）' },
];
const KIND_OPTIONS = [
  { value: 'unit', name: '所属单位' },
  { value: 'project', name: '项目部' },
  { value: 'team', name: '机构/班组' },
];
const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员', lease_admin: '租赁管理员',
  admin: '小程序管理员',
};

Page({
  data: {
    // 组织树
    tree: [],
    orgs: [],
    units: [],
    orgForm: { name: '', parentIndex: 0, kindIndex: 0, editingId: '' },
    parentOptions: [{ _id: '', name: '（根节点 / 所属单位）' }],
    // 用户
    users: [],
    roleOptions: ROLE_OPTIONS,
    kindOptions: KIND_OPTIONS,
    userForm: {
      editingId: '', username: '', password: '', nickname: '',
      roleIndex: 0, unitIndex: 0, orgIndex: 0,
    },
    orgOptions: [],
    loading: false,
  },

  onShow() {
    // 权限守卫：仅小程序管理员(admin)可进入系统管理后台（组织与用户管理）
    const p = auth.getProfile();
    if (!p || p.role !== ROLES.ADMIN) {
      wx.showModal({
        title: '无权限', content: '仅小程序管理员(admin)可访问系统管理（组织/用户/字典/日志）。',
        showCancel: false, success: () => wx.navigateBack(),
      });
      return;
    }
    this.load();
  },

  async load() {
    const [orgs, users] = await Promise.all([
      api.getOrgTree().catch(() => []),
      api.listUsers().catch(() => []),
    ]);
    const list = orgs || [];
    const idMap = {};
    list.forEach((o) => { idMap[o._id] = o; });
    // 扁平树（用于展示层级）
    const flat = [];
    const walk = (node, depth) => {
      flat.push({ _id: node._id, name: node.name, kind: node.kind, depth, hasChild: list.some((c) => c.parentId === node._id) });
      list.filter((c) => c.parentId === node._id).forEach((c) => walk(c, depth + 1));
    };
    list.filter((n) => !n.parentId).forEach((n) => walk(n, 0));
    const units = list.filter((o) => o.level === 0);
    // 父级候选项（用于新增组织时选择上级）
    const parentOptions = [{ _id: '', name: '（根节点 / 所属单位）' }].concat(
      list.map((o) => ({ _id: o._id, name: (o.kind === 'unit' ? '单位·' : o.kind === 'project' ? '项目部·' : '班组·') + o.name }))
    );
    this.setData({ tree: flat, orgs: list, units, parentOptions }, () => this.refreshOrgOptions());
    this.setData({ users: (users || []).map((u) => ({ ...u, roleText: ROLE_TEXT[u.role] || u.role })) });
  },

  // 用户表单：根据所选单位，构建机构/班组候选项（带路径）
  refreshOrgOptions() {
    const { orgs, units, userForm } = this.data;
    const unit = units[userForm.unitIndex];
    const idMap = {};
    orgs.forEach((o) => { idMap[o._id] = o; });
    const options = [];
    if (unit) {
      orgs.forEach((o) => {
        if (o._id === unit._id) return;
        let p = o.parentId, ok = false;
        while (p) { if (p === unit._id) { ok = true; break; } p = idMap[p] ? idMap[p].parentId : null; }
        if (!ok) return;
        const path = [];
        let cur = o;
        while (cur) { path.unshift(cur.name); cur = idMap[cur.parentId]; }
        options.push({ _id: o._id, label: path.join(' / '), unitId: unit._id });
      });
    }
    // 修正越界
    let orgIndex = userForm.orgIndex;
    if (orgIndex >= options.length) orgIndex = 0;
    this.setData({ orgOptions: options, ['userForm.orgIndex']: orgIndex });
  },

  // ── 组织：表单输入 ──
  onOrgName(e) { this.setData({ 'orgForm.name': e.detail.value }); },
  onOrgParent(e) { this.setData({ 'orgForm.parentIndex': +e.detail.value }); },
  onOrgKind(e) { this.setData({ 'orgForm.kindIndex': +e.detail.value }); },

  async onOrgSubmit() {
    const { orgForm, parentOptions, kindOptions } = this.data;
    if (!orgForm.name) { wx.showToast({ title: '请填写组织名称', icon: 'none' }); return; }
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ loading: true });
    try {
      const parent = parentOptions[orgForm.parentIndex];
      const kind = kindOptions[orgForm.kindIndex].value;
      if (orgForm.editingId) {
        await api.manageOrg({ op: 'update', id: orgForm.editingId, data: { name: orgForm.name, parentId: parent._id, kind } });
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        await api.manageOrg({ op: 'add', data: { name: orgForm.name, parentId: parent._id, kind } });
        wx.showToast({ title: '已新增', icon: 'success' });
      }
      this.setData({ orgForm: { name: '', parentIndex: 0, kindIndex: 0, editingId: '' } });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onOrgEdit(e) {
    const id = e.currentTarget.dataset.id;
    const org = this.data.orgs.find((o) => o._id === id);
    if (!org) return;
    const parentOptions = this.data.parentOptions;
    let parentIndex = 0;
    if (org.parentId) {
      const idx = parentOptions.findIndex((p) => p._id === org.parentId);
      if (idx >= 0) parentIndex = idx;
    }
    const kindIndex = Math.max(0, this.data.kindOptions.findIndex((k) => k.value === org.kind));
    this.setData({ orgForm: { name: org.name, parentIndex, kindIndex, editingId: id } });
  },

  async onOrgDelete(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '删除组织', content: '确认删除该组织？其下级需先删除；归属该组织的用户将被置为未分配。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.manageOrg({ op: 'delete', id });
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },

  async onOrgSeed() {
    const ok = await new Promise((resolve) => wx.showModal({
      title: '恢复默认组织架构', content: '仅在当前组织架构为空时可用，将写入『总包/分包企业 → 项目部 → 班组』默认结构。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.manageOrg({ op: 'seed' });
      wx.showToast({ title: '已恢复默认', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  // ── 用户：表单输入 ──
  onUserInput(e) { this.setData({ ['userForm.' + e.currentTarget.dataset.f]: e.detail.value }); },
  onUserRole(e) { this.setData({ 'userForm.roleIndex': +e.detail.value }); },
  onUserUnit(e) { this.setData({ 'userForm.unitIndex': +e.detail.value }, () => this.refreshOrgOptions()); },
  onUserOrg(e) { this.setData({ 'userForm.orgIndex': +e.detail.value }); },

  async onUserSubmit() {
    const { userForm, roleOptions, orgOptions } = this.data;
    if (!userForm.username) { wx.showToast({ title: '请填写用户名', icon: 'none' }); return; }
    if (!userForm.editingId && !userForm.password) { wx.showToast({ title: '请填写密码', icon: 'none' }); return; }
    const org = orgOptions[userForm.orgIndex];
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ loading: true });
    try {
      const role = roleOptions[userForm.roleIndex].value;
      const payload = {
        username: userForm.username,
        nickname: userForm.nickname || userForm.username,
        role,
        unitId: org ? org.unitId : '',
        orgId: org ? org._id : '',
      };
      if (userForm.password) payload.password = userForm.password; // 新增必填；编辑时仅非空更新
      if (userForm.editingId) {
        await api.manageUser({ op: 'update', id: userForm.editingId, data: payload });
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        await api.manageUser({ op: 'add', data: payload });
        wx.showToast({ title: '已新增', icon: 'success' });
      }
      this.setData({ userForm: { editingId: '', username: '', password: '', nickname: '', roleIndex: 0, unitIndex: 0, orgIndex: 0 } });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUserEdit(e) {
    const id = e.currentTarget.dataset.id;
    const u = this.data.users.find((x) => x._id === id);
    if (!u) return;
    const roleIndex = Math.max(0, this.data.roleOptions.findIndex((r) => r.value === u.role));
    let unitIndex = 0;
    if (u.unitId) {
      const idx = this.data.units.findIndex((un) => un._id === u.unitId);
      if (idx >= 0) unitIndex = idx;
    }
    this.setData({ userForm: { editingId: id, username: u.username || '', password: '', nickname: u.nickname || '', roleIndex, unitIndex, orgIndex: 0 } }, () => {
      this.refreshOrgOptions();
      // 定位已有 orgId
      const idx = this.data.orgOptions.findIndex((o) => o._id === u.orgId);
      if (idx >= 0) this.setData({ 'userForm.orgIndex': idx });
    });
  },

  async   onUserDelete(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '删除用户', content: '确认删除该用户账号？此操作不可恢复。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.manageUser({ op: 'delete', id });
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },

  // 子功能入口：数据字典 / 操作日志
  onGo(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
});
