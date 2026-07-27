// pkg-barcode/pages/gen/gen.js —— M14.1 真实二维码图形生成 + 标签输出
const api = require('../../../utils/api');
const qrcode = require('../../utils/qrcode.js');
const { resolveUser } = require('../../../utils/user-utils');

Page({
  data: {
    list: [], idx: 0,
    code: null, label: null, rendered: false, saving: false,
  },

  async onLoad() {
    const r = await api.getToolList({ size: 100 }).catch(() => []);
    const list = (Array.isArray(r) ? r : (r.list || [])).filter(Boolean);
    this.setData({ list, idx: list.length ? 0 : -1 });
  },

  onPick(e) { this.setData({ idx: +e.detail.value, code: null, label: null, rendered: false }); },

  async onGen() {
    const t = this.data.list[this.data.idx];
    if (!t) { wx.showToast({ title: '请选择器具', icon: 'none' }); return; }
    const r = await api.generateBarcode(t._id).catch(() => null);
    const f = await api.getBarcodeFile(t._id).catch(() => null);
    let label = (f && f.fields) || null;
    // 统一展示：保管人 openid 解析为可读姓名
    if (label && label.keeper) {
      label = { ...label, keeperDisplay: await resolveUser(label.keeper).catch(() => label.keeper) };
    }
    this.setData({ code: r, label });
    this.renderQR((r && (r.code || t.code)) || '');
  },

  // 真实可扫码二维码（qrcode-generator，纯 JS，无 DOM 依赖）
  renderQR(text) {
    if (!text) return;
    let qr;
    try {
      qr = qrcode(0, 'M'); // 0=自动版本
      qr.addData(text);
      qr.make();
    } catch (e) {
      wx.showToast({ title: '编码生成失败', icon: 'none' });
      return;
    }
    const count = qr.getModuleCount();
    wx.createSelectorQuery().in(this).select('#qr').fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || wx.getSystemInfoSync().pixelRatio || 2;
        const size = res[0].width;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        const cell = size / count;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#0F2B5B';
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
          }
        }
        this._canvas = canvas;
        this.setData({ rendered: true });
      });
  },

  onSave() {
    if (!this._canvas) { wx.showToast({ title: '请先生成', icon: 'none' }); return; }
    this.setData({ saving: true });
    wx.canvasToTempFilePath({
      canvas: this._canvas,
      success: (r) => {
        wx.saveImageToPhotosAlbum({
          filePath: r.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '可长按二维码保存', icon: 'none' }),
        });
      },
      complete: () => this.setData({ saving: false }),
    });
  },

  // 子功能入口：标识核验 / 标签打印 / 批量作业
  onGo(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
});
