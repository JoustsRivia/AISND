// pkg-system/pages/log/log.js —— M13.3 操作日志查询
const api = require('../../../utils/api');

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

Page({
  data: { logs: [], loading: true, types: TYPES, activeType: '' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  // 切换类型筛选（后端按 type 过滤；'' 表示全部）
  onFilter(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.activeType) return;
    this.setData({ activeType: type }, () => this.load());
  },

  async load() {
    this.setData({ loading: true });
    const params = { limit: 100 };
    if (this.data.activeType) params.type = this.data.activeType;
    const r = await api.getOperationLogs(params).catch(() => null);
    const logs = (r || []).map((l) => ({ ...l, time: fmt(l.ts) }));
    this.setData({ logs, loading: false });
  },
});
