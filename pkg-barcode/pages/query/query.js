// pkg-barcode/pages/query/query.js —— M14.1.3 扫码查询（防伪/状态）
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: { code: '', result: null },
  onInput(e) { this.setData({ code: e.detail.value }); },

  async onScan() {
    try { await network.requireOnline(); } catch (e) { return; }
    wx.scanCode({
      success: async (res) => { this.query(res.result); },
    });
  },

  async onQuery() {
    if (!this.data.code) { wx.showToast({ title: '请输入或扫描编码', icon: 'none' }); return; }
    this.query(this.data.code);
  },

  async query(code) {
    wx.showLoading({ title: '核验中…' });
    const r = await api.verifyTestTag(code).catch(() => null);
    wx.hideLoading();
    if (r && r.toolId) {
      // R17 成功反馈
      wx.vibrateShort({ type: 'medium' });
      this.setData({ result: r, code });
    } else {
      // R17 失败反馈
      wx.vibrateShort({ type: 'heavy' });
      this.setData({ result: null });
      wx.showModal({
        title: '未识别器具',
        content: '编码「' + code + '」未匹配到有效器具档案，请核对标识牌/条码后重试。',
        showCancel: false,
      });
    }
  },

  // R17 查看档案
  onGoArchive() {
    if (!this.data.result || !this.data.result.toolId) return;
    wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + this.data.result.toolId });
  },
});
