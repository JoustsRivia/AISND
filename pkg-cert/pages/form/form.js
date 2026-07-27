// pkg-cert/pages/form/form.js —— 证书登记/编辑
const api = require('../../../utils/api');
const network = require('../../../utils/network');
const { CERT_TYPES } = require('../../../utils/constants');

Page({
  data: {
    id: '', types: CERT_TYPES, typeIdx: 0,
    no: '', expireAt: '', issuer: '', photos: [], submitting: false,
  },

  async onLoad(opts) {
    if (opts.id) {
      this.setData({ id: opts.id });
      const r = await api.certList({}).catch(() => null);
      const c = (r || []).find((x) => x._id === opts.id);
      if (c) {
        const idx = Math.max(0, CERT_TYPES.findIndex((t) => t.code === c.type));
        this.setData({ typeIdx: idx, no: c.no || '', expireAt: c.expireAt || '', issuer: c.issuer || '', photos: c.photos || [] });
      }
    }
  },

  onType(e) { this.setData({ typeIdx: +e.detail.value }); },
  bindNo(e) { this.setData({ no: e.detail.value }); },
  onExpire(e) { this.setData({ expireAt: e.detail.value }); },
  bindIssuer(e) { this.setData({ issuer: e.detail.value }); },

  // D9：照片区已由 attachment-uploader 组件接管（支持预览/删除）
  onPhotosChange(e) {
    this.setData({ photos: e.detail.value });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    const { id, types, typeIdx, no, expireAt, issuer, photos } = this.data;
    if (!expireAt) { wx.showToast({ title: '请选择有效期', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await api.upsertCert({ id, type: types[typeIdx].code, no, expireAt, issuer, photos });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  },
});
