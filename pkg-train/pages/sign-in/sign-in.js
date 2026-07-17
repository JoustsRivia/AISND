// pkg-train/pages/sign-in/sign-in.js —— M9.2 我的培训 / 签到考核
const api = require('../../../utils/api');
const network = require('../../../utils/network');

const TRAIN_STATUS = {
  pending: '待签到',
  signed: '已签到',
  certified: '已认证',
  failed: '未通过',
};

Page({
  data: { list: [], loading: true },

  async onLoad() { await this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true });
    const list = await api.getMyTraining().catch(() => []);
    const mapped = (list || []).map((it) => ({
      ...it,
      _statusText: TRAIN_STATUS[it.status] || it.status || '未知',
    }));
    this.setData({ list: mapped, loading: false });
  },

  async onSignIn(e) {
    const item = e.currentTarget.dataset.item;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.signInTraining({ id: item._id, score: 90, certified: true });
      wx.showToast({ title: '签到成功', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },
});
