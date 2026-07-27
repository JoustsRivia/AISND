// pkg-barcode/pages/label/label.js —— M3.1.3 标识牌文件生成（仅生成文件，不接打印硬件）
const api = require('../../../utils/api');
const { resolveUser } = require('../../../utils/user-utils');

Page({
  data: { tools: [], idx: 0, label: null },

  async onLoad() {
    const r = await api.getToolList({ size: 200 }).catch(() => []);
    const tools = (r || []).map((item) => ({
      ...item,
      displayPath: (item.store || '') + ' / ' + (item.keeper || ''),
    }));
    this.setData({ tools, idx: tools.length ? 0 : -1 });
  },

  onPick(e) { this.setData({ idx: +e.detail.value, label: null }); },

  async onGen() {
    const t = this.data.tools[this.data.idx];
    if (!t) { wx.showToast({ title: '请选择器具', icon: 'none' }); return; }
    const r = await api.genLabel(t._id).catch(() => null);
    const fields = (r && r.fields) || null;
    // 统一展示：把保管人 openid 解析为可读姓名（解析失败回退 openid）
    if (fields && fields.keeper) {
      fields.keeperDisplay = await resolveUser(fields.keeper).catch(() => fields.keeper);
    }
    this.setData({ label: fields });
    if (r) wx.showToast({ title: '已生成', icon: 'success' });
  },

  onShare() {
    const f = this.data.label;
    if (!f) return;
    const lines = [
      '工器具标识牌',
      '名称：' + (f.name || ''),
      '编号：' + (f.code || ''),
      '类别：' + (f.category || ''),
      '规格：' + (f.spec || ''),
      '上次试验：' + (f.lastTestDate || ''),
      '有效截止：' + (f.expireAt || ''),
      '库房：' + (f.store || ''),
      '保管责任人：' + (f.keeperDisplay || f.keeper || ''),
    ];
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/标识牌_${f.code || Date.now()}.txt`;
    fs.writeFile({
      filePath: path, data: lines.join('\n'), encoding: 'utf8',
      success: () => wx.shareFileMessage({ filePath: path, fileName: '标识牌.txt', fail: () => wx.showToast({ title: '已生成标识牌文件', icon: 'success' }) }),
      fail: () => wx.showToast({ title: '生成失败', icon: 'none' }),
    });
  },
});
