// pkg-barcode/pages/print/print.js —— M14 打印文件输出
// 器具选择：联想搜索选择器（与 label 页同源交互，选项带库房·类别特征）
const api = require('../../../utils/api');
const { resolveUser } = require('../../../utils/user-utils');
const { catName } = require('../../../utils/display'); // 优化#13：类别中文

Page({
  data: { label: null },

  onPickTool(e) {
    const v = e.detail && e.detail.value;
    this._tool = (v && v.raw) || null;
    this.setData({ label: null });
  },

  async onPrint() {
    const t = this._tool;
    if (!t) { wx.showToast({ title: '请搜索选择器具', icon: 'none' }); return; }
    const r = await api.getBarcodeFile(t._id).catch(() => null);
    const fields = (r && r.fields) || null;
    // 统一展示：保管人 openid 解析为可读姓名
    if (fields && fields.keeper) {
      fields.keeperDisplay = await resolveUser(fields.keeper).catch(() => fields.keeper);
    }
    // 优化#13：类别英文码 → 中文
    if (fields) fields.categoryText = catName(fields.category);
    this.setData({ label: fields });
  },

  onDoPrint() {
    if (!this.data.label) return;
    const f = this.data.label;
    const lines = [
      '善工智管 — 器具标签',
      '名称：' + (f.name || ''),
      '编号：' + (f.code || ''),
      '类别：' + (catName(f.category) || ''), // 优化#13：类别中文
      '试验日期：' + (f.testDate || ''),
      '有效截止：' + (f.expireAt || ''),
      '检测单位：' + (f.org || ''),
      '保管人：' + (f.keeperDisplay || f.keeper || ''),
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
