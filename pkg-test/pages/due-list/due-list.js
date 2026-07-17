// pkg-test/pages/due-list/due-list.js —— M4.1.3 待检器具归集清单
const api = require('../../../utils/api');

Page({
  data: { list: [], loading: true },
  async onLoad() { this.load(); },
  async load() {
    const res = await api.getTestDueList().catch(() => []);
    this.setData({ list: res || [], loading: false });
  },
  goSubmit(e) {
    wx.navigateTo({ url: '/pkg-test/pages/submit/submit?id=' + e.currentTarget.dataset.id });
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
});
