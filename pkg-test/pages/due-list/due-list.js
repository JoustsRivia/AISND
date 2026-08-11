// pkg-test/pages/due-list/due-list.js —— M4.1.3 待检器具归集清单
const api = require('../../../utils/api');
const { catName } = require('../../../utils/display'); // 优化#13：类别中文

Page({
  data: { list: [], loading: true },
  async onLoad() { this.load(); },
  async load() {
    const res = await api.getTestDueList().catch(() => []);
    // 优化#13：类别英文码 → 中文
    const list = (res || []).map((t) => ({ ...t, categoryText: catName(t.category) }));
    this.setData({ list, loading: false });
  },
  goSubmit(e) {
    wx.navigateTo({ url: '/pkg-test/pages/submit/submit?id=' + e.currentTarget.dataset.id });
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh()); },
});
