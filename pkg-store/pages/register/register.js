// pkg-store/pages/register/register.js —— M3.1 库房注册
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    name: '',
    orgId: '',
    zone: '',
    keeper: '',
    submitting: false,
  },

  bindName(e) { this.setData({ name: e.detail.value }); },
  bindOrg(e) { this.setData({ orgId: e.detail.value }); },
  bindZone(e) { this.setData({ zone: e.detail.value }); },
  bindKeeper(e) { this.setData({ keeper: e.detail.value }); },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    const { name, orgId, zone, keeper } = this.data;
    if (!name) { wx.showToast({ title: '请填写库房名称', icon: 'none' }); return; }
    if (!orgId) { wx.showToast({ title: '请填写所属组织', icon: 'none' }); return; }
    if (!keeper) { wx.showToast({ title: '请填写管理员', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await api.registerStore({ name, orgId, zone, keeper });
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: '注册失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
