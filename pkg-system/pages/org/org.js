// pkg-system/pages/org/org.js —— M13 组织架构与用户管理
// R09：组织权限按树分发（admin/a1 全量、单位级管理本单位子树、b21/c21 项目部子树，其余只读）
// R10：人员列表分类检索（角色筛选 + 关键字搜索）
// 词表统一（2026-08-08）：角色清单/筛选项/进入权限全部为三级树码 + admin
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');
const network = require('../../../utils/network');
const { ROLES, ROLE_ORDER, ROLE_FAMILIES, ROLE_TEXT } = require('../../../utils/constants');
const { orgPathText, subtreeIds } = require('../../../utils/org-utils'); // 优化#15：移动防环
const { getRoleMeta } = require('../../../utils/role-tree');

// 可分配角色（与 cloudfunctions/system ROLE_ADMIN_ASSIGNABLE 同源：三级树 14 码 + admin）
const ROLE_OPTIONS = ROLE_ORDER.map((v) => ({ value: v, name: ROLE_TEXT[v] || v }))
  .concat([{ value: 'admin', name: ROLE_TEXT.admin }]);
const KIND_OPTIONS = [
  { value: 'unit', name: '所属单位' },
  { value: 'project', name: '项目部' },
  { value: 'team', name: '机构/班组' },
];

// R10：检索用角色筛选项（含「全部」选项；admin 服务端指派亦列出）
const ROLE_FILTER_OPTIONS = [
  { value: '', name: '全部角色' },
].concat(ROLE_ORDER.map((r) => ({ value: r, name: ROLE_TEXT[r] || r })))
 .concat([{ value: 'admin', name: ROLE_TEXT.admin }]);

// R09：可进入组织管理页的角色（平台级 a1 / 单位级管理 / 项目部负责人 b21/c21；其余不可进）
const ORG_VIEW_ROLES = [ROLES.ADMIN, 'a1', ...ROLE_FAMILIES.UNIT_MGMT, 'b21', 'c21'];

Page({
  data: {
    // 组织树
    tree: [],
    orgs: [],
    units: [],
    orgForm: { name: '', parentIndex: 0, kindIndex: 0, editingId: '' },
    parentOptions: [{ _id: '', name: '（根节点 / 所属单位）' }],
    // R09：组织编辑权限
    orgPerm: { role: '', canEdit: false, canAdd: false, canDelete: false, editableIds: null },
    // 用户
    users: [],
    roleOptions: ROLE_OPTIONS,
    kindOptions: KIND_OPTIONS,
    userForm: {
      editingId: '', username: '', password: '', nickname: '',
      roleIndex: 0, unitIndex: 0, orgIndex: 0,
    },
    orgOptions: [],
    // R10：检索条件
    roleFilterOptions: ROLE_FILTER_OPTIONS,
    roleFilterIndex: 0,
    keyword: '',
    userPage: 1,
    userPageSize: 50,
    userTotal: 0,
    loading: false,
    // 优化#16：库房管理（架构页内联）
    storePanel: { orgId: '', orgName: '', stores: [], loading: false },
    showStoreForm: false,
    storeSubmitting: false,
    storeForm: { editingId: '', orgId: '', name: '', zone: '', keeper: '' },
  },

  onShow() {
    // R09：放宽权限守卫，admin/lead/project_lead/supervisor 均可进入（supervisor 只读）
    const p = auth.getProfile();
    if (!p || !ORG_VIEW_ROLES.includes(p.role)) {
      wx.showModal({
        title: '无权限', content: '仅 admin / lead / project_lead / supervisor 可访问组织管理（supervisor 为只读）。',
        showCancel: false, success: () => wx.navigateBack(),
      });
      return;
    }
    this.load();
  },

  async load() {
    // R09：并行拉取组织树、组织权限、用户列表
    const [orgs, orgPerm, usersRes] = await Promise.all([
      api.getOrgTree().catch(() => []),
      api.getOrgPerm().catch(() => ({ role: '', canEdit: false, canAdd: false, canDelete: false, editableIds: [] })),
      this.loadUsers(),
    ]);
    const list = orgs || [];
    const idMap = {};
    list.forEach((o) => { idMap[o._id] = o; });
    // R09：根据 editableIds 计算每个节点的可编辑标记
    const perm = orgPerm || { role: '', canEdit: false, canAdd: false, canDelete: false, editableIds: [] };
    const editableIdsIsAll = perm.editableIds === null || perm.editableIds === undefined;
    const editableSet = editableIdsIsAll ? null : new Set(perm.editableIds || []);
    // 扁平树（用于展示层级）
    const flat = [];
    const walk = (node, depth) => {
      flat.push({
        _id: node._id, name: node.name, kind: node.kind, depth,
        hasChild: list.some((c) => c.parentId === node._id),
        // editableIds 为 null 时全部可编辑；否则仅 editableIds 中的节点可编辑
        canEditNode: editableSet === null ? perm.canEdit : (perm.canEdit && editableSet.has(node._id)),
        canDeleteNode: editableSet === null ? perm.canDelete : (perm.canDelete && editableSet.has(node._id)),
      });
      list.filter((c) => c.parentId === node._id).forEach((c) => walk(c, depth + 1));
    };
    list.filter((n) => !n.parentId).forEach((n) => walk(n, 0));
    const units = list.filter((o) => o.level === 0);
    // 父级候选项（用于新增组织时选择上级；优化#15：附 kind 供三级树类型联动校验）
    const parentOptions = [{ _id: '', kind: '', name: '（根节点 / 所属单位）' }].concat(
      list.map((o) => ({ _id: o._id, kind: o.kind, name: (o.kind === 'unit' ? '单位·' : o.kind === 'project' ? '项目部·' : '班组·') + o.name }))
    );
    this.setData({
      tree: flat, orgs: list, units, parentOptions,
      orgPerm: perm,
    }, () => this.refreshOrgOptions());
    // 用户列表（问题 #6：组织显示完整路径，替代「已分配/未分配」粗显示）
    const users = (usersRes && usersRes.list) || (Array.isArray(usersRes) ? usersRes : []);
    this.setData({
      users: users.map((u) => ({ ...u, roleText: ROLE_TEXT[u.role] || u.role, orgText: orgPathText(list, u.orgId) })),
      userTotal: (usersRes && usersRes.total) || users.length,
    });
  },

  // R10：拉取用户列表（带角色筛选 + 关键字）
  loadUsers() {
    const { roleFilterOptions, roleFilterIndex, keyword, userPage, userPageSize } = this.data;
    const role = roleFilterOptions[roleFilterIndex] ? roleFilterOptions[roleFilterIndex].value : '';
    return api.manageUser({
      op: 'list',
      role: role || undefined,
      keyword: keyword ? keyword.trim() : undefined,
      page: userPage,
      pageSize: userPageSize,
    }).catch(() => ({ list: [], total: 0 }));
  },

  // R10：重新检索用户（重置到第一页）
  async onUserSearch() {
    this.setData({ userPage: 1 });
    try {
      const res = await this.loadUsers();
      const users = (res && res.list) || [];
      this.setData({
        users: users.map((u) => ({ ...u, roleText: ROLE_TEXT[u.role] || u.role })),
        userTotal: (res && res.total) || users.length,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '查询失败', icon: 'none' });
    }
  },
  onRoleFilterChange(e) { this.setData({ roleFilterIndex: +e.detail.value }); },
  onKeywordInput(e) { this.setData({ keyword: e.detail.value }); },
  onKeywordClear() { this.setData({ keyword: '' }); },

  // 用户表单：根据所选单位 + 角色 orgKind，构建组织候选项（问题 #6：与注册端 ORG_KIND_MAP / role-tree orgKind 同源约束）
  //   unit 角色 → 仅单位节点本身；project 角色 → 仅项目部节点；team 角色 → 仅班组节点；无 orgKind → 全部后代
  refreshOrgOptions() {
    const { orgs, units, userForm } = this.data;
    const unit = units[userForm.unitIndex];
    if (!unit) {
      // 单位索引越界（单位列表变更后旧索引失效）：归零重取，避免提交时静默丢组织
      this.setData({ orgOptions: [], 'userForm.unitIndex': 0, 'userForm.orgIndex': 0 }, () => this.refreshOrgOptions());
      return;
    }
    const role = (this.data.roleOptions[userForm.roleIndex] || {}).value;
    const meta = role ? getRoleMeta(role) : null;
    const orgKind = meta ? meta.orgKind : null;
    const idMap = {};
    orgs.forEach((o) => { idMap[o._id] = o; });
    const options = [];
    if (orgKind === 'unit') {
      // 单位级角色：候选 = 该单位节点本身（子树内不存在 unit 类型节点）
      options.push({ _id: unit._id, label: '单位·' + unit.name, unitId: unit._id });
    } else if (unit) {
      orgs.forEach((o) => {
        if (o._id === unit._id) return;
        let p = o.parentId, ok = false;
        while (p) { if (p === unit._id) { ok = true; break; } p = idMap[p] ? idMap[p].parentId : null; }
        if (!ok) return;
        if (orgKind && o.kind !== orgKind) return; // project/team 类型约束
        const path = [];
        let cur = o;
        while (cur) { path.unshift(cur.name); cur = idMap[cur.parentId]; }
        options.push({
          _id: o._id,
          label: (o.kind === 'project' ? '项目部·' : '班组·') + path.join(' / '),
          unitId: unit._id,
        });
      });
    }
    // 修正越界（候选随角色约束变少时，旧 orgIndex 归零）
    let orgIndex = userForm.orgIndex;
    if (orgIndex >= options.length) orgIndex = 0;
    this.setData({ orgOptions: options, ['userForm.orgIndex']: orgIndex });
  },

  // ── 组织：表单输入 ──
  onOrgName(e) { this.setData({ 'orgForm.name': e.detail.value }); },
  // 优化#15：切换上级时按三级树架构自动纠正类型（unit 挂根 / project 挂 unit / team 挂 project）
  onOrgParent(e) {
    const idx = +e.detail.value;
    const parent = this.data.parentOptions[idx] || {};
    const ALLOWED = { '': ['unit'], unit: ['project'], project: ['team'], team: [] };
    const allowed = ALLOWED[parent.kind || ''] || [];
    const kindIndex = allowed.length
      ? Math.max(0, this.data.kindOptions.findIndex((k) => k.value === allowed[0]))
      : this.data.kindIndex;
    this.setData({ 'orgForm.parentIndex': idx, 'orgForm.kindIndex': kindIndex });
  },
  onOrgKind(e) { this.setData({ 'orgForm.kindIndex': +e.detail.value }); },

  // 优化#15：树行「新增下级」——预填父级并打开表单
  onOrgAdd(e) {
    const id = e.currentTarget.dataset.id;
    const parentIndex = Math.max(0, this.data.parentOptions.findIndex((p) => p._id === id));
    // 按父级类型给默认子类型：unit → project；project → team；team 已是最末层
    const parent = this.data.parentOptions[parentIndex] || {};
    const kindIndex = parent.kind === 'unit' ? 1 : parent.kind === 'project' ? 2 : 0;
    this.setData({ orgForm: { name: '', parentIndex, kindIndex, editingId: '' } });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  async onOrgSubmit() {
    const { orgForm, parentOptions, kindOptions, orgPerm } = this.data;
    // R09：编辑权限校验
    if (orgForm.editingId && !orgPerm.canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' }); return;
    }
    if (!orgForm.editingId && !orgPerm.canAdd) {
      wx.showToast({ title: '无新增权限', icon: 'none' }); return;
    }
    if (orgForm.editingId && orgPerm.editableIds !== null && Array.isArray(orgPerm.editableIds)
        && !orgPerm.editableIds.includes(orgForm.editingId)) {
      wx.showToast({ title: '该节点无编辑权限', icon: 'none' }); return;
    }
    if (!orgForm.name) { wx.showToast({ title: '请填写组织名称', icon: 'none' }); return; }
    // 优化#15 移动子树防环（前端预检，服务端仍权威校验）：目标父级不能位于自身子树内
    if (orgForm.editingId) {
      const parentId = (parentOptions[orgForm.parentIndex] || {})._id || '';
      if (parentId) {
        const subs = subtreeIds(this.data.orgs, orgForm.editingId);
        if (subs.includes(parentId)) {
          wx.showToast({ title: '不能移动到自身下级组织下', icon: 'none' });
          return;
        }
      }
    }
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ loading: true });
    try {
      // 优化#2 空值守卫：parentIndex 越界/组织树加载失败时 parent 为 undefined，此前直接抛；
      // parent._id 为 '' 是合法的「根节点」默认值（parentIndex 0），不可拦截
      const parent = parentOptions[orgForm.parentIndex] || {};
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
    // R09：编辑权限校验
    const node = this.data.tree.find((x) => x._id === e.currentTarget.dataset.id);
    if (node && !node.canEditNode) {
      wx.showToast({ title: '该节点无编辑权限', icon: 'none' });
      return;
    }
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
    // R09：删除权限校验
    const node = this.data.tree.find((x) => x._id === id);
    if (node && !node.canDeleteNode) {
      wx.showToast({ title: '该节点无删除权限', icon: 'none' });
      return;
    }
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
  onUserRole(e) {
    // 角色变化 → 按 orgKind 刷新组织候选（问题 #6）并重置已选组织
    this.setData({ 'userForm.roleIndex': +e.detail.value, 'userForm.orgIndex': 0 }, () => this.refreshOrgOptions());
  },
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

  // ═══ 优化#16：库房管理纳入架构页（树节点下挂库房） ═══
  // 展开/收起某组织的库房列表
  async onStoreToggle(e) {
    const orgId = e.currentTarget.dataset.id;
    const orgName = e.currentTarget.dataset.name || '';
    if (this.data.storePanel && this.data.storePanel.orgId === orgId) {
      this.setData({ storePanel: { orgId: '', orgName: '', stores: [], loading: false } });
      return;
    }
    this.setData({ storePanel: { orgId, orgName, stores: [], loading: true } });
    const stores = await api.getStoreList({ orgId }).catch(() => []);
    this.setData({ storePanel: { orgId, orgName, stores: stores || [], loading: false } });
  },

  // 打开新增库房表单（预填所属组织）
  onStoreAdd(e) {
    const orgId = e.currentTarget.dataset.orgid || e.currentTarget.dataset.id || '';
    this.setData({
      showStoreForm: true,
      storeForm: { editingId: '', orgId, name: '', zone: '', keeper: '' },
    });
  },

  // 打开编辑库房表单
  onStoreEdit(e) {
    const s = (this.data.storePanel.stores || []).find((x) => x._id === e.currentTarget.dataset.id);
    if (!s) return;
    this.setData({
      showStoreForm: true,
      storeForm: { editingId: s._id, orgId: s.orgId || '', name: s.name || '', zone: s.zone || '', keeper: s.keeper || '' },
    });
  },

  onStoreName(e) { this.setData({ 'storeForm.name': e.detail.value }); },
  onStoreZone(e) { this.setData({ 'storeForm.zone': e.detail.value }); },
  onStoreKeeper(e) { this.setData({ 'storeForm.keeper': e.detail.value }); },
  onStoreClose() { this.setData({ showStoreForm: false }); },

  // 新增/保存库房（服务端校验 orgId 可编辑范围；编辑时 orgId 不可变更）
  async onStoreSubmit() {
    const { storeForm } = this.data;
    if (!storeForm.name) { wx.showToast({ title: '请填写库房名称', icon: 'none' }); return; }
    try { await network.requireOnline(); } catch (err) { return; }
    this.setData({ storeSubmitting: true });
    try {
      if (storeForm.editingId) {
        await api.updateStore(storeForm.editingId, { name: storeForm.name, zone: storeForm.zone, keeper: storeForm.keeper });
      } else {
        await api.registerStore({ name: storeForm.name, zone: storeForm.zone, keeper: storeForm.keeper, orgId: storeForm.orgId });
      }
      wx.showToast({ title: storeForm.editingId ? '已保存' : '已新增', icon: 'success' });
      this.setData({ showStoreForm: false });
      // 刷新当前展开组织的库房
      if (this.data.storePanel.orgId) this.onStoreToggle({ currentTarget: { dataset: { id: this.data.storePanel.orgId, name: this.data.storePanel.orgName } } });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ storeSubmitting: false });
    }
  },

  // 删除库房（二次确认；服务端校验：库房下仍有器具时拒绝）
  async onStoreDelete(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '删除库房', content: '确认删除该库房？库房下仍有器具时无法删除。',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.deleteStore(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      if (this.data.storePanel.orgId) this.onStoreToggle({ currentTarget: { dataset: { id: this.data.storePanel.orgId, name: this.data.storePanel.orgName } } });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
