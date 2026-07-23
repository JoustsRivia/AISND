// pkg-ledger/pages/import/import.js —— 问题5：按台账模板批量导入工器具
const api = require('../../../utils/api');

// 模板列（与 cloudfunctions/tool importTools 字段一一对应）
const COLS = [
  '名称', '类别', '规格', '出厂编号', '采购日期', '检验周期(月)',
  '上次试验', '有效截止', '存放', '保管', '来源', '出租单位', '合格证号', '现场操作人',
];
const CAT_HINT = '类别取值：insulation(绝缘) / motor(手持电动) / manual(手动) / lifting(起重承压) / height(高空) / measure(计量) / temp_power(临时配电) / lease(租赁)';
const SRC_HINT = '来源取值：self(自购) / lease(租赁)';

Page({
  data: {
    text: '',
    catHint: CAT_HINT,
    srcHint: SRC_HINT,
    importing: false,
    result: '',
  },

  // 下载模板：生成 CSV 文本，复制到剪贴板并落盘
  onDownloadTpl() {
    const header = COLS.join(',');
    const example = [
      '绝缘手套（12kV）', 'insulation', '12kV', 'JX2024-001', '2024-03-01', '6',
      '2024-03-10', '2024-09-10', '一班库房·A03', '张工', 'self', '', '', '',
    ].join(',');
    const csv = '﻿' + [header, example].join('\r\n');
    wx.setClipboardData({
      data: csv,
      success: () => {
        const fs = wx.getFileSystemManager();
        const path = `${wx.env.USER_DATA_PATH}/工器具导入模板_${Date.now()}.csv`;
        fs.writeFile({
          filePath: path, data: csv, encoding: 'utf8',
          success: () => wx.showModal({ title: '模板已生成', content: `CSV 已复制到剪贴板，并保存为文件。\n请按模板填写后粘贴回本页文本框导入。\n${CAT_HINT}\n${SRC_HINT}`, showCancel: false }),
          fail: () => wx.showToast({ title: '模板已复制到剪贴板', icon: 'none' }),
        });
      },
    });
  },

  onText(e) { this.setData({ text: e.detail.value }); },

  // 选择微信会话文件（CSV/TXT）并读取内容填入 textarea
  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'txt'],
      success: (res) => {
        const fp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].path;
        if (!fp) {
          wx.showToast({ title: '未选择文件', icon: 'none' });
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: fp,
          encoding: 'utf-8',
          success: (r) => {
            const text = (r && r.data) ? String(r.data) : '';
            this.setData({ text, result: '' });
            wx.showToast({ title: '文件已读取', icon: 'success' });
          },
          fail: () => wx.showToast({ title: '文件读取失败', icon: 'none' }),
        });
      },
      fail: () => { /* 用户取消，静默 */ },
    });
  },

  // 解析 CSV → 行对象数组，过滤空行与缺名称行
  _parse() {
    const raw = (this.data.text || '').trim();
    if (!raw) return { rows: [], err: '请先粘贴 CSV 内容' };
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { rows: [], err: '至少需表头 + 1 条数据' };
    const headers = lines[0].split(',').map((h) => h.trim());
    const idx = (name) => headers.indexOf(name);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim());
      const get = (h) => { const k = idx(h); return k >= 0 ? (cells[k] || '') : ''; };
      const name = get('名称');
      if (!name) continue; // 跳过空行/缺名称
      rows.push({
        name,
        category: get('类别') || 'manual',
        spec: get('规格'),
        factoryNo: get('出厂编号'),
        purchaseDate: get('采购日期'),
        testPeriod: get('检验周期(月)') || 6,
        lastTestDate: get('上次试验'),
        expireAt: get('有效截止'),
        store: get('存放'),
        keeper: get('保管'),
        source: get('来源') || 'self',
        leaseUnit: get('出租单位'),
        certNo: get('合格证号'),
        operator: get('现场操作人'),
      });
    }
    if (!rows.length) return { rows: [], err: '未解析到有效数据（每条须有「名称」）' };
    return { rows, err: '' };
  },

  async onImport() {
    const { rows, err } = this._parse();
    if (err) { wx.showToast({ title: err, icon: 'none' }); return; }
    this.setData({ importing: true, result: '' });
    wx.showLoading({ title: '导入中' });
    try {
      const res = await api.importTools({ rows }).catch((e) => ({ count: 0, error: e.message }));
      wx.hideLoading();
      const n = (res && res.count) || 0;
      const errors = (res && res.errors) || [];
      let result = `成功导入 ${n} 台工器具`;
      if (errors.length) {
        result += `\n失败行号：${errors.map((e) => e.line || e.row || e).join(', ')}`;
      }
      this.setData({ result, text: '' });
      wx.showToast({ title: `导入 ${n} 台`, icon: n > 0 ? 'success' : 'none' });
    } catch (e) {
      wx.hideLoading();
      this.setData({ result: '导入失败：' + (e.message || '服务异常') });
    } finally {
      this.setData({ importing: false });
    }
  },

  onBack() { wx.navigateBack(); },
});
