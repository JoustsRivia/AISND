// pkg-system/pages/log/log.js —— M13.3 操作日志查询（增强：组合筛选 + 服务端分页 + 范围切换）
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 可筛选的日志类型（与 api.logOperation 写入的 type 对齐；后端 listLog 已支持 type 过滤）
const TYPES = [
  { value: '', label: '全部' },
  { value: 'borrow', label: '领用/归还' },
  { value: 'scrap', label: '报废' },
  { value: 'purchase', label: '采购/验收' },
  { value: 'store', label: '入库' },
  { value: 'user', label: '权限变更' },
];

// 将日期选择器值（YYYY-MM-DD）转为毫秒时间戳
const toMs = (v) => (v ? new Date(v + 'T00:00:00').getTime() : 0);

Page({
  data: {
    logs: [], loading: true, loadingMore: false,
    types: TYPES, activeType: '',
    // 组合筛选（后端 listLog 已支持）
    operatorName: '', keyword: '', startTime: '', endTime: '',
    // 分页 + 范围（迭代 Item 4）
    scope: 'all', isAdmin: false,
    page: 1, pageSize: 20, total: 0, hasMore: false,
  },

  onShow() {
    const p = auth.getProfile();
    this.setData({ isAdmin: !!(p && p.role === 'admin') });
    this.load(true);
  },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()); },

  // 切换类型筛选（后端按 type 过滤；'' 表示全部）
  onFilter(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.activeType) return;
    this.setData({ activeType: type }, () => this.load(true));
  },

  onOpInput(e) { this.setData({ operatorName: e.detail.value }); },
  onKeywordInput(e) { this.setData({ keyword: e.detail.value }); },
  onStartChange(e) { this.setData({ startTime: e.detail.value }); },
  onEndChange(e) { this.setData({ endTime: e.detail.value }); },

  // 重置全部筛选条件
  onReset() {
    this.setData({ activeType: '', operatorName: '', keyword: '', startTime: '', endTime: '' }, () => this.load(true));
  },

  // 组合筛选查询
  onSearch() { this.load(true); },

  // 范围切换（仅管理员可在 全部 / 仅我的 间切换；非管理员恒为「仅我的」）
  onScope(e) {
    const scope = e.currentTarget.dataset.scope;
    if (scope === this.data.scope) return;
    this.setData({ scope }, () => this.load(true));
  },

  // 加载（reset=true 重置为第 1 页并替换；false 为加载下一页并追加）
  async load(reset = false) {
    if (reset) this.setData({ page: 1, loading: true });
    else this.setData({ loadingMore: true });
    const { activeType, operatorName, keyword, startTime, endTime, scope, page, pageSize } = this.data;
    const params = { limit: pageSize, skip: (page - 1) * pageSize, scope };
    if (activeType) params.type = activeType;
    if (operatorName) params.operatorName = operatorName;
    if (keyword) params.keyword = keyword;
    const s = toMs(startTime), e = toMs(endTime);
    if (s) params.startTime = s;
    if (e) params.endTime = e + 24 * 3600 * 1000 - 1; // 含当日终点
    try {
      const r = await api.getOperationLogs(params).catch(() => null);
      const list = (r && r.list) || [];
      const mapped = list.map((l) => ({
        ...l,
        time: fmt(l.ts),
        name: l.operatorName || l.operator || '', // 优先展示可读署名，回退 openid
      }));
      const logs = reset ? mapped : this.data.logs.concat(mapped);
      this.setData({
        logs,
        total: (r && r.total) || 0,
        hasMore: !!(r && r.hasMore),
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  // 加载下一页（追加）
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.setData({ page: this.data.page + 1 }, () => this.load(false));
  },

  // 上一页（回到该页，替换）
  onPrev() {
    if (this.data.page <= 1 || this.data.loadingMore) return;
    this.setData({ page: this.data.page - 1 }, () => this.load(true));
  },

  // CSV 导出：生成 CSV 并写入临时文件，同时复制到剪贴板（小程序跨端最稳方案）
  onExport() {
    const rows = this.data.logs;
    if (!rows.length) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }
    const head = ['时间', '类型', '操作人', '动作', '对象'];
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push([r.time, r.type || '', r.name || '', r.action || '', r.target || ''].map(cell).join(','));
    }
    const csv = '﻿' + lines.join('\n'); // BOM 便于 Excel 识别 UTF-8
    try {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/operation_logs.csv`;
      fs.writeFileSync(filePath, csv, 'utf8');
      wx.setClipboardData({ data: csv, success: () => wx.showToast({ title: 'CSV 已复制/导出', icon: 'success' }) });
    } catch (err) {
      wx.setClipboardData({ data: csv, success: () => wx.showToast({ title: 'CSV 已复制到剪贴板', icon: 'none' }) });
    }
  },
});
