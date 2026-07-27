// pkg-maint/pages/plan/plan.js —— M7.1 保养计划与执行登记
const api = require('../../../utils/api');
const network = require('../../../utils/network');

// 状态展示
const STATUS = {
  planned: { text: '待执行', cls: 'warn' },
  done: { text: '已完成', cls: 'ok' },
};

Page({
  data: {
    list: [], loading: true,
    // 执行弹窗
    showExec: false, cur: null, execDetail: '',
  },

  async onLoad() { await this.load(); },
  async onShow() { await this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true });
    const list = await api.listMaintenancePlans({}).catch(() => []);
    const mapped = (list || []).map((it) => ({
      ...it,
      _status: STATUS[it.status] || STATUS.planned,
      _planDate: (it.planDate || '').slice(0, 10),
    }));
    this.setData({ list: mapped, loading: false });
  },

  onCreate() { wx.navigateTo({ url: '/pkg-maint/pages/create/create?type=maintenance' }); },

  onExec(e) {
    const cur = this.data.list[e.currentTarget.dataset.idx];
    if (cur.status === 'done') return;
    this.setData({ showExec: true, cur, execDetail: '' });
  },

  bindDetail(e) { this.setData({ execDetail: e.detail.value }); },

  async onConfirmExec() {
    const { cur, execDetail } = this.data;
    if (!cur) return;
    try { await network.requireOnline(); } catch (err) { return; }
    wx.showLoading({ title: '提交中' });
    try {
      await api.execMaintenancePlan({ id: cur._id, detail: execDetail.trim() });
      wx.showToast({ title: '已登记执行', icon: 'success' });
      this.setData({ showExec: false, cur: null });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '登记失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onCloseExec() { this.setData({ showExec: false, cur: null }); },
});
