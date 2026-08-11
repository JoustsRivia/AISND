// pkg-maint/pages/create/create.js —— M7 维保报修发起
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    type: 'maintenance',   // 'maintenance' 保养计划 | 'repair' 故障报修
    toolId: '',
    planDate: '',
    content: '',            // 保养内容
    fault: '',              // 故障现象
    desc: '',              // 情况说明
    submitting: false,
  },

  onLoad(query = {}) {
    if (query.type === 'repair' || query.type === 'maintenance') {
      this.setData({ type: query.type });
    }
  },

  onTypeChange(e) { this.setData({ type: e.detail.value }); },
  bindToolId(e) { this.setData({ toolId: e.detail.value }); },
  // 优化#12：编号联想选中回填（code-autocomplete 组件）
  onPickCode(e) { this.setData({ toolId: e.detail.code || '' }); },
  bindContent(e) { this.setData({ content: e.detail.value }); },
  bindFault(e) { this.setData({ fault: e.detail.value }); },
  bindDesc(e) { this.setData({ desc: e.detail.value }); },

  onDate(e) { this.setData({ planDate: e.detail.value }); },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    const d = this.data;
    if (!d.toolId) { wx.showToast({ title: '请填写器具编号', icon: 'none' }); return; }

    let payload, fn;
    if (d.type === 'maintenance') {
      if (!d.planDate) { wx.showToast({ title: '请选择计划日期', icon: 'none' }); return; }
      if (!d.content) { wx.showToast({ title: '请填写保养内容', icon: 'none' }); return; }
      fn = api.createMaintenance;
      payload = { toolId: d.toolId, planDate: d.planDate, content: d.content };
    } else {
      if (!d.fault) { wx.showToast({ title: '请填写故障现象', icon: 'none' }); return; }
      fn = api.reportRepair;
      payload = { toolId: d.toolId, fault: d.fault, desc: d.desc };
    }

    this.setData({ submitting: true });
    try {
      await fn(payload);
      wx.showToast({ title: '已提交', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
