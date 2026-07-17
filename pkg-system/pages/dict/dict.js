// pkg-system/pages/dict/dict.js —— M13.2 字典与检查表模板管理
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    dict: [],          // [{ _id, type, label, value }]
    tpl: [],           // [{ _id, name, items? }]
    name: '', submitting: false,
  },

  async onLoad() { this.load(); },

  async load() {
    const dict = await api.getDict('tool_category').catch(() => null);
    const tpl = await api.manageCheckTemplate({ op: 'list' }).catch(() => null);
    this.setData({ dict: dict || [], tpl: tpl || [] });
  },

  bindName(e) { this.setData({ name: e.detail.value }); },

  async onAdd() {
    const name = this.data.name;
    if (!name) {
      wx.showToast({ title: '请输入模板名称', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ submitting: true });
    try {
      await api.manageCheckTemplate({ op: 'add', data: { name, items: [] } });
      wx.showToast({ title: '已新增模板', icon: 'success' });
      this.setData({ name: '' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '新增失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
