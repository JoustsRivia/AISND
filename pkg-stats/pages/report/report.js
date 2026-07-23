// pkg-stats/pages/report/report.js —— M12 报表导出
const api = require('../../../utils/api');

const STATUS_NAME = {
  qualified: '合格', pending_test: '待检', in_use: '领用中',
  maintaining: '维修中', scrapped: '已报废', missing: '缺失/禁用',
};
const CAT_NAME = {
  insulation: '绝缘工器具', motor: '手持电动机具', manual: '通用手动工具',
  lifting: '起重承压类', height: '高空防护器具', measure: '计量检测器具',
  temp_power: '临时配电配套', lease: '大型租赁机具',
};

Page({
  data: { loading: true, total: 0, byStatus: [], byCategory: [] },

  async onLoad() { await this.load(); },

  async load() {
    this.setData({ loading: true });
    const d = await api.exportReport({}).catch(() => null);
    if (!d) { this.setData({ loading: false }); return; }
    const byStatus = Object.keys(d.byStatus || {}).map((k) => ({ name: STATUS_NAME[k] || k, value: d.byStatus[k] }));
    const byCategory = Object.keys(d.byCategory || {}).map((k) => ({ name: CAT_NAME[k] || k, value: d.byCategory[k] }));
    this.setData({ total: d.total, byStatus, byCategory, loading: false });
  },

  onCopy() {
    const lines = ['善工智管 — 报表导出'];
    lines.push('器具总数：' + this.data.total);
    lines.push('—— 按状态 ——');
    this.data.byStatus.forEach((it) => lines.push(`${it.name}：${it.value}`));
    lines.push('—— 按类别 ——');
    this.data.byCategory.forEach((it) => lines.push(`${it.name}：${it.value}`));
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '已复制报表', icon: 'none' }),
    });
  },

  // M12.2.5 报表导出：生成 CSV 文件并分享（支持表格软件打开）
  onExportCsv() {
    const rows = [['维度', '分类', '数量']];
    this.data.byStatus.forEach((it) => rows.push(['按状态', it.name, it.value]));
    this.data.byCategory.forEach((it) => rows.push(['按类别', it.name, it.value]));
    const csv = '﻿' + rows.map((r) => r.join(',')).join('\n');
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/工器具报表_${Date.now()}.csv`;
    fs.writeFile({
      filePath: path, data: csv, encoding: 'utf8',
      success: () => {
        wx.shareFileMessage({
          filePath: path,
          fileName: '工器具报表.csv',
          fail: () => wx.showToast({ title: '分享取消', icon: 'none' }),
        });
      },
      fail: () => wx.showToast({ title: '导出失败', icon: 'none' }),
    });
  },
});
