// pkg-borrow/pages/records/records.js —— M5.1.4 / M5.2.3 领用归还记录
// 问题 #4：领用/归还通过扫一扫实现——扫码后跳器具详情（tool-detail 有状态校验 + 领用/归还按钮）
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    type: 'all',
    tabs: [{ v: 'all', n: '全部' }, { v: 'borrow', n: '领用' }, { v: 'return', n: '归还' }],
    list: [], loading: true,
    // 优化#6 筛选：按 器具编号/名称/库房/保管人 过滤；默认服务端仅返回最近 20 条
    kwType: 'code',
    kwTypes: [
      { v: 'code', n: '编号' }, { v: 'name', n: '名称' },
      { v: 'store', n: '库房' }, { v: 'keeper', n: '保管人' },
    ],
    kw: '',
  },

  async onLoad() { this.load(); },
  async load() {
    const t = this.data.type === 'all' ? undefined : this.data.type;
    const p = { type: t };
    const kw = (this.data.kw || '').trim();
    if (kw) p[this.data.kwType] = kw;
    const res = await api.getBorrowRecords(p).catch(() => []);
    this.setData({ list: res || [], loading: false });
  },
  onTab(e) {
    this.setData({ type: e.currentTarget.dataset.v });
    this.load();
  },
  onKwType(e) {
    this.setData({ kwType: e.currentTarget.dataset.v });
    this.load();
  },
  onKwInput(e) {
    this.setData({ kw: e.detail.value });
    clearTimeout(this._kwTimer);
    this._kwTimer = setTimeout(() => this.load(), 300); // 300ms 防抖
  },
  onKwClear() {
    this.setData({ kw: '' });
    this.load();
  },

  // 扫码领用/归还（问题 #4）：扫器具条码 → 校验存在 → 跳详情页操作
  async onScan() {
    try { await network.requireOnline(); } catch (e) { wx.showToast({ title: '当前无网络', icon: 'none' }); return; }
    wx.scanCode({
      success: async (res) => {
        const code = res.result;
        if (code && code.indexOf('AISND|ID|') === 0) {
          wx.showToast({ title: '请扫描器具条码', icon: 'none' });
          return;
        }
        const tool = await api.getToolDetail(code).catch(() => null);
        if (!tool) { wx.showToast({ title: '未识别的器具', icon: 'none' }); return; }
        wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + (tool._id || code) });
      },
      fail: () => { /* 用户取消 */ },
    });
  },
});
