// pkg-ledger/pages/import/import.js —— 问题3：按台账模板批量导入工器具
const api = require('../../../utils/api');
const { TOOL_CATEGORIES } = require('../../../utils/constants'); // 优化#13：类别中文兼容

// 类别中文名 → 英文码 反查表（导出 CSV 已是中文，导入须兼容）
const CAT_CODE_BY_NAME = {};
TOOL_CATEGORIES.forEach((c) => { CAT_CODE_BY_NAME[c.name] = c.code; });

// 模板列（与 cloudfunctions/tool importTools 字段一一对应）
// 2026-08-08 重写：修复历史编码损坏导致的表头乱码（原「检验周�?(�?)」无法匹配用户 CSV 表头）
const COLS = [
  '名称', '类别', '规格', '出厂编号', '采购日期', '检验周期(月)',
  '上次试验', '有效截止', '存放', '保管', '来源', '出租单位', '合格证号', '现场操作人',
];
const CAT_HINT = '类别取值：insulation(绝缘) / motor(手持电动) / manual(手动) / lifting(起重承压) / height(高空) / measure(计量) / temp_power(临时配电) / lease(租赁)';
const SRC_HINT = '来源取值：self(自购) / lease(租赁)';
// 优化#8：保管/操作人列填「工号」，导入时自动匹配到该用户（匹配不到则原样保存并提示）
const KEEPER_HINT = '保管 / 现场操作人 列填工号（如 W001），将自动匹配为对应人员姓名';
// 优化#10：导入自动归属操作者当前台账层级（组织），无需在 CSV 中填写归属
const ORG_HINT = '导入器具将自动归属到你当前的台账层级（组织），档案页可查看归属路径';

Page({
  data: {
    text: '',
    fileName: '', // 优化#9：纯文件导入，展示所选文件名
    catHint: CAT_HINT,
    srcHint: SRC_HINT,
    keeperHint: KEEPER_HINT,
    orgHint: ORG_HINT,
    importing: false,
    result: '',
    // 模板下载地址（夸克网盘，问题 #3：原云存储签名二维码已过期导致空白，改为复制地址）
    tplUrl: 'https://pan.quark.cn/s/83bee6a0863f?pwd=G4Sd',
  },

  // 下载模板：复制网盘模板下载地址（问题 #3）
  onDownloadTpl() {
    wx.setClipboardData({
      data: this.data.tplUrl,
      success: () => wx.showToast({ title: '模板下载地址已复制', icon: 'success' }),
    });
  },

  // 优化#9：选择微信会话 CSV 文件 → 读取后自动解析导入（替代原 textarea 复制粘贴）
  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'txt'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.path) {
          wx.showToast({ title: '未选择文件', icon: 'none' });
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: 'utf-8',
          success: (r) => {
            const text = (r && r.data) ? String(r.data) : '';
            this.setData({ text, fileName: f.name || 'CSV 文件', result: '' });
            wx.showToast({ title: '文件已读取，开始导入', icon: 'success' });
            this.onImport();
          },
          fail: () => wx.showToast({ title: '文件读取失败，请确认文件编码为 UTF-8', icon: 'none' }),
        });
      },
      fail: () => { /* 用户取消，静默 */ },
    });
  },

  // 解析 CSV 为行对象数组，过滤空行与缺名称行
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
      if (!name) continue; // 跳过空行/缺名称行
      rows.push({
        name,
        // 优化#13：类别兼容中英文（导出 CSV 为中文，模板可为英文码）
        category: CAT_CODE_BY_NAME[get('类别')] || get('类别') || 'manual',
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
      // 优化#8：未匹配到人员的工号提示核对（已原样保存，便于人工修正）
      const unmatched = (res && res.unmatched) || [];
      if (unmatched.length) {
        result += `\n未匹配工号：${unmatched.join('、')}（已按原值保存，请核对后在档案中修改）`;
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
