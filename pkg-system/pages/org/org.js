// pkg-system/pages/org/org.js —— M13.1 组织架构与用户管理
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    tree: [],          // 扁平化后的组织树 [{ _id, name, type, depth }]
    name: '', role: '', orgId: '',
    submitting: false,
  },

  async onLoad() { this.load(); },

  async load() {
    const tree = await api.getOrgTree().catch(() => null);
    const list = tree || [];
    const flat = [];
    const walk = (node, depth) => {
      flat.push({ _id: node._id, name: node.name, type: node.type, depth });
      list.filter((c) => c.parentId === node._id).forEach((c) => walk(c, depth + 1));
    };
    list.filter((n) => !n.parentId).forEach((n) => walk(n, 0));
    this.setData({ tree: flat });
  },

  bindName(e) { this.setData({ name: e.detail.value }); },
  bindRole(e) { this.setData({ role: e.detail.value }); },
  bindOrg(e) { this.setData({ orgId: e.detail.value }); },

  async onAdd() {
    const { name, role, orgId } = this.data;
    if (!name || !role || !orgId) {
      wx.showToast({ title: '请填写姓名/角色/组织', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ submitting: true });
    try {
      await api.manageUser({ op: 'add', data: { name, role, orgId } });
      wx.showToast({ title: '已新增用户', icon: 'success' });
      this.setData({ name: '', role: '', orgId: '' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '新增失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
