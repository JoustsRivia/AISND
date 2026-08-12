// pkg-test/pages/submit/submit.js —— M4.2 送检登记与结果录入
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    id: '', tool: null,
    testOrg: '', result: 'qualified',
    reportFileId: '', reportName: '',
    testDate: '', nextExpireAt: '', today: '',
    submitting: false,
  },

  onLoad(o) {
    const today = fmtDate(new Date());
    this.setData({ id: o.id, today, testDate: today });
    this.load(o.id);
  },
  onTestDate(e) {
    const testDate = e.detail.value;
    const t = this.data.tool;
    const period = (t && t.testPeriod) || 6;
    const d = new Date(testDate);
    d.setMonth(d.getMonth() + Number(period));
    this.setData({ testDate, nextExpireAt: fmtDate(d) });
  },
  async load(id) {
    const t = await api.getToolDetail(id).catch(() => null);
    this.setData({ tool: t });
  },
  onOrg(e) { this.setData({ testOrg: e.detail.value }); },
  onResult(e) { this.setData({ result: e.detail.value }); },

  async onUpload() {
    const r = await wx.chooseMedia({ count: 1, mediaType: ['image'] });
    const f = r.tempFiles[0].tempFilePath;
    const fileId = await api.uploadFile(f, 'image');
    this.setData({ reportFileId: fileId, reportName: f.split('/').pop() });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    if (!this.data.testOrg) { wx.showToast({ title: '请填写检测单位', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await api.submitTest({
        id: this.data.id, testOrg: this.data.testOrg,
        result: this.data.result, reportFileId: this.data.reportFileId,
        testDate: this.data.testDate,
      });
      wx.showToast({ title: this.data.result === 'qualified' ? '已登记合格' : '已判定报废', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

// 统一 yyyy-mm-dd 格式（禁止 UTC 显示）
function fmtDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}
