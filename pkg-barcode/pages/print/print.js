// pkg-barcode/pages/print/print.js —— M14 打印文件输出
const api = require('../../../utils/api');

Page({
  data: { list: [], idx: 0, label: null },

  async onLoad() {
    const r = await api.getToolList({ size: 100 }).catch(() => []);
    this.setData({ list: r || [] });
  },
  onPick(e) { this.setData({ idx: +e.detail.value, label: null }); },

  async onPrint() {
    const t = this.data.list[this.data.idx];
    if (!t) { wx.showToast({ title: '请选择器具', icon: 'none' }); return; }
    const r = await api.getBarcodeFile(t._id).catch(() => null);
    this.setData({ label: r && r.fields });
  },

  onDoPrint() {
    if (!this.data.label) return;
    const f = this.data.label;
    const lines = [
      '善工智管 — 器具标签',
      '名称：' + (f.name || ''),
      '编号：' + (f.code || ''),
      '类别：' + (f.category || ''),
      '试验日期：' + (f.testDate || ''),
      '有效截止：' + (f.expireAt || ''),
      '检测单位：' + (f.org || ''),
      '保管人：' + (f.keeper || ''),
    ];
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/标签_${f.code || Date.now()}.txt`;
    fs.writeFile({
      filePath: path, data: lines.join('\n'), encoding: 'utf8',
      success: () => {
        wx.shareFileMessage({
          filePath: path, fileName: '器具标签.txt',
          fail: () => wx.showToast({ title: '已生成标签文件', icon: 'success' }),
        });
      },
      fail: () => wx.showToast({ title: '生成失败', icon: 'none' }),
    });
  },
});
