// pkg-system/pages/log/log.js —— M13.3 操作日志查询
const api = require('../../../utils/api');

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

Page({
  data: { logs: [], loading: true },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    const r = await api.getOperationLogs({ limit: 100 }).catch(() => null);
    const logs = (r || []).map((l) => ({ ...l, time: fmt(l.ts) }));
    this.setData({ logs, loading: false });
  },
});
