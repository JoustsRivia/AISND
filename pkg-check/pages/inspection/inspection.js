// pkg-check/pages/inspection/inspection.js —— M10.1 监督检查任务
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    list: [], loading: true,
    active: null, result: '', remark: '',
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await this.load();
  },
  async onPullDownRefresh() { try { await this.load(); } finally { wx.stopPullDownRefresh(); } },

  async load() {
    this.setData({ loading: true });
    const list = await api.getInspectionTasks().catch(() => []);
    this.setData({ list: list || [], loading: false });
  },

  onPickTask(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({ active: item, result: '', remark: '' });
  },
  bindResult(e) { this.setData({ result: e.detail.value }); },
  bindRemark(e) { this.setData({ remark: e.detail.value }); },

  async onSubmit() {
    const item = this.data.active;
    if (!item) return;
    if (!this.data.result && !this.data.remark) {
      wx.showToast({ title: '请填写结果或备注', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.submitInspection({ id: item._id, result: this.data.result, remark: this.data.remark });
      wx.showToast({ title: '已提交', icon: 'success' });
      this.setData({ active: null, result: '', remark: '' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

  onCancel() { this.setData({ active: null, result: '', remark: '' }); },
});
