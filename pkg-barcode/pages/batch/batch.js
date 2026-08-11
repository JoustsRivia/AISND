// pkg-barcode/pages/batch/batch.js —— M14.2 批量操作（生成条码/入库/点检）
// 2026-08-09：器具选择改为「联想搜索 + 已选卡片」——输入名称/编号/库房/保管人联想，
// 选中项进入已选列表（带编号/库房/类别特征，可移除），替代原先平铺前 200 台无检索的列表。
const api = require('../../../utils/api');
const network = require('../../../utils/network');
const { catName } = require('../../../utils/display');

const MODES = [
  { key: 'gen', label: '批量生成条码', fn: 'batchGenBarcode', ok: '已生成' },
  { key: 'inbound', label: '批量入库', fn: 'batchInbound', ok: '已入库' },
  { key: 'spot', label: '批量点检', fn: 'batchSpotCheck', ok: '已点检' },
];

Page({
  data: { selected: [], modeIdx: 0, modes: MODES, result: null, doing: false },

  onMode(e) { this.setData({ modeIdx: +e.detail.value, result: null }); },

  // 联想选中 → 加入已选列表（去重，显示唯一特征）
  onPickTool(e) {
    const v = e.detail && e.detail.value;
    if (!v || !v.raw) return;
    const t = v.raw;
    const sel = this.data.selected.slice();
    if (sel.some((x) => x._id === t._id)) {
      wx.showToast({ title: '已在列表中', icon: 'none' });
      return;
    }
    sel.push({
      _id: t._id, code: t.code, name: t.name,
      sub: [t.store, catName(t.category)].filter(Boolean).join(' · '),
    });
    this.setData({ selected: sel, result: null });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selected: this.data.selected.filter((x) => x._id !== id) });
  },

  async onExec() {
    const ids = this.data.selected.map((x) => x._id);
    if (!ids.length) { wx.showToast({ title: '请先搜索添加器具', icon: 'none' }); return; }
    try { await network.requireOnline(); } catch (err) { return; }
    const m = this.data.modes[this.data.modeIdx];
    this.setData({ doing: true });
    try {
      const r = await api[m.fn](ids);
      this.setData({ result: r, doing: false });
      wx.showToast({ title: `${m.ok} ${r.count || ids.length} 条`, icon: 'success' });
    } catch (err) {
      this.setData({ doing: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
