// pkg-site/pages/daily-check/daily-check.js —— M6 每日点检汇总看板
const api = require('../../../utils/api');
const { TOOL_CATEGORIES } = require('../../../utils/constants');

const CAT_NAME = {};
TOOL_CATEGORIES.forEach((c) => { CAT_NAME[c.code] = c.name; });

Page({
  data: { date: '', total: 0, done: 0, rate: 0, items: [], loading: true },

  onShow() { this.load(); },

  async load() {
    const d = await api.getDailyCheck().catch(() => null);
    if (d) {
      const items = (d.items || []).map((it) => ({
        ...it,
        categoryText: CAT_NAME[it.category] || it.category,
      }));
      this.setData({
        date: d.date, total: d.total, done: d.done, rate: d.rate,
        items, loading: false,
      });
    } else {
      this.setData({ loading: false });
    }
  },

  onTapItem(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.status === 'pending') {
      wx.navigateTo({ url: '/pkg-site/pages/spot-check/spot-check?toolId=' + (item.toolId || '') });
    }
  },

  goCheck() { wx.navigateTo({ url: '/pkg-site/pages/spot-check/spot-check' }); },

  // 子功能入口：操作规程 / 班前交底
  onGo(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
});
