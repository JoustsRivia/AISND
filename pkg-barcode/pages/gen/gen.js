// pkg-barcode/pages/gen/gen.js —— M14.1 真实二维码图形生成 + 标签输出
// 器具选择：库房 → 类别 → 编号 三级联动（2026-08-09），编号选项按序排列并带名称/类别/库房特征，便于分辨同类型器具
const api = require('../../../utils/api');
const qrcode = require('../../utils/qrcode.js');
const { resolveUser } = require('../../../utils/user-utils');
const { catName } = require('../../../utils/display'); // 优化#13：类别中文
const { TOOL_CATEGORIES } = require('../../../utils/constants');

Page({
  data: {
    stores: [], cats: [], filtered: [], // 三级选项（filtered 为当前库房+类别下的器具）
    storeIdx: 0, catIdx: 0, toolIdx: -1,
    loading: true,
    code: null, label: null, rendered: false, saving: false,
  },

  async onLoad() {
    this.setData({ loading: true });
    // 库房列表 + 全量器具（分页）并行拉取；全量存实例属性，避免大数组进 setData 超限
    const [storeList, tools] = await Promise.all([
      api.getStoreList({}).catch(() => []),
      api.getAllTools().catch(() => []),
    ]);
    this._allTools = tools || [];
    const stores = [{ code: '', name: '全部库房' }, ...(storeList || []).map((s) => ({ code: s._id, name: s.name }))];
    const cats = [{ code: '', name: '全部类别' }, ...TOOL_CATEGORIES];
    this.setData({ stores, cats, loading: false });
    this._applyFilter();
  },

  // ── 三级联动 ──
  onStorePick(e) {
    this.setData({ storeIdx: +e.detail.value, toolIdx: -1, code: null, label: null, rendered: false });
    this._applyFilter();
  },
  onCatPick(e) {
    this.setData({ catIdx: +e.detail.value, toolIdx: -1, code: null, label: null, rendered: false });
    this._applyFilter();
  },
  onToolPick(e) { this.setData({ toolIdx: +e.detail.value, code: null, label: null, rendered: false }); },

  _applyFilter() {
    const { stores, cats, storeIdx, catIdx } = this.data;
    const store = stores[storeIdx];
    const cat = cats[catIdx];
    let f = this._allTools || [];
    if (store && store.code) f = f.filter((t) => (t.store || '') === store.name);
    if (cat && cat.code) f = f.filter((t) => t.category === cat.code);
    // 编号升序排列，「最后选编号」一目了然
    f = f.slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    f = f.map((t) => ({ ...t, categoryText: catName(t.category) }));
    this.setData({ filtered: f, toolIdx: f.length ? 0 : -1 });
  },

  async onGen() {
    const t = this.data.filtered[this.data.toolIdx];
    if (!t) { wx.showToast({ title: '请选择器具（当前组合无匹配）', icon: 'none' }); return; }
    const r = await api.generateBarcode(t._id).catch(() => null);
    const f = await api.getBarcodeFile(t._id).catch(() => null);
    let label = (f && f.fields) || null;
    // 统一展示：保管人 openid 解析为可读姓名
    if (label && label.keeper) {
      label = { ...label, keeperDisplay: await resolveUser(label.keeper).catch(() => label.keeper) };
    }
    this.setData({ code: r, label });
    this.renderQR((r && (r.code || t.code)) || '', {
      name: (r && r.name) || t.name || '',
      code: (r && r.code) || t.code || '',
      category: t.category || '',
      expireAt: (r && r.expireAt) || '',
      store: (r && r.store) || '',
      keeperDisplay: (r && r.keeperDisplay) || '',
    });
  },

  // 真实可扫码二维码（qrcode-generator，纯 JS，无 DOM 依赖）
  // 修复：单 canvas 绘制完整标签 = 二维码 + 编号/名称/类别/有效期/保管人 文字信息，
  // 保存图片时文字随图导出（原只导出二维码区，附加信息缺失）
  renderQR(text, meta) {
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
        const dpr = wx.getWindowInfo().pixelRatio || 2; // lib 3.0.0 必有 getWindowInfo，getSystemInfoSync 已弃用
        const W = res[0].width;   // 逻辑宽（CSS px）
        const H = res[0].height;  // 逻辑高
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        // 白底整卡
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        // 二维码（占满宽度，顶部）
        const cell = W / count;
        ctx.fillStyle = '#0F2B5B';
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
          }
        }
        // 文字信息区（二维码下方）：名称 / 编号 / 类别 / 有效期 / 保管人
        const m = meta || {};
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1f2329';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(m.name || '', W / 2, W + 22);
        ctx.fillStyle = '#374151';
        ctx.font = '13px sans-serif';
        ctx.fillText('编号：' + (m.code || ''), W / 2, W + 40);
        ctx.fillText('类别：' + (catName(m.category) || '—'), W / 2, W + 56);
        ctx.fillText('有效期：' + (m.expireAt || '—'), W / 2, W + 72);
        ctx.fillText('保管：' + (m.keeperDisplay || '—'), W / 2, W + 88);
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
