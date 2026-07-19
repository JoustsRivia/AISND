// pkg-system/pages/log/log.js —— M13.3 操作日志查询 + 日志策略/限流管理（增强：组合筛选 + 服务端分页 + 范围切换 + 留存/限流后台 + 限流看板 + 手动清理）
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');
const network = require('../../../utils/network');

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
  { value: 'system', label: '策略变更' },
];

// 将日期选择器值（YYYY-MM-DD）转为毫秒时间戳
const toMs = (v) => (v ? new Date(v + 'T00:00:00').getTime() : 0);

// 留存策略可编辑项（与 system/index.js DEFAULT_RETENTION 对齐；_default 为未显式分类日志的回退档）
const RETENTION_FIELDS = [
  { k: 'user', label: '权限变更' },
  { k: 'scrap', label: '报废' },
  { k: 'purchase', label: '采购' },
  { k: 'store', label: '入库' },
  { k: 'cert', label: '持证' },
  { k: '_default', label: '其他默认' },
];
const DEFAULT_RETENTION_DAYS = 180;

// 限流策略可编辑组（与 system/index.js DEFAULT_RATE 对齐）
const RATE_GROUPS = [
  { g: 'default', label: '普通动作防刷' },
  { g: 'import', label: '批量导入建档' },
  { g: 'batch', label: '批量入库生成' },
];

Page({
  data: {
    logs: [], loading: true, loadingMore: false,
    types: TYPES, activeType: '',
    // 组合筛选（后端 listLog 已支持）
    operatorName: '', keyword: '', startTime: '', endTime: '',
    // 分页 + 范围（迭代 Item 4）
    scope: 'all', isAdmin: false,
    page: 1, pageSize: 20, total: 0, hasMore: false,
    // ── 日志策略与限流管理（item 3/4，仅管理员可见）──
    retentionFields: RETENTION_FIELDS, retention: null, savingRetention: false,
    rateGroups: RATE_GROUPS, rate: null, savingRate: false,
    rateStats: null, rateSummary: '', loadingStats: false,
    cleaning: false, lastClean: null,
  },

  onShow() {
    const p = auth.getProfile();
    const isAdmin = !!(p && p.role === 'admin');
    this.setData({ isAdmin });
    this.load(true);
    if (isAdmin) this.loadAdmin();
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

  // ── 日志策略与限流管理（item 3/4，仅管理员）──────────────────────
  // 拉取留存策略 / 限流策略 / 限流看板，填充管理卡片
  async loadAdmin() {
    try {
      const [ret, rate, stats] = await Promise.all([
        api.getRetention().catch(() => null),
        api.getRateLimit().catch(() => null),
        api.getRateStats().catch(() => null),
      ]);
      const retention = ret ? { ...ret.policy, _default: DEFAULT_RETENTION_DAYS } : null;
      const rateObj = rate ? rate.policy : null;
      let rateSummary = '';
      if (stats && stats.policy) {
        const p = stats.policy;
        const ws = (o) => (o && o.window ? Math.round(o.window / 1000) : 0);
        const mx = (o) => (o && o.max != null ? o.max : 0);
        rateSummary = `默认 ${ws(p.default)}s/${mx(p.default)} · 导入 ${ws(p.import)}s/${mx(p.import)} · 批量 ${ws(p.batch)}s/${mx(p.batch)}`;
      }
      this.setData({ retention, rate: rateObj, rateStats: stats, rateSummary });
    } catch (e) { /* 管理卡片静默降级 */ }
  },

  // 留存策略输入（按字段键更新）
  onRetentionInput(e) {
    const k = e.currentTarget.dataset.k;
    const v = parseInt(e.detail.value, 10);
    this.setData({ ['retention.' + k]: Number.isFinite(v) && v >= 0 ? v : 0 });
  },

  // 保存留存策略（仅管理员；后端写字典 + 审计日志 retention_set）
  async onSaveRetention() {
    const r = this.data.retention;
    if (!r) return;
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ savingRetention: true });
    const policy = {
      user: r.user, scrap: r.scrap, purchase: r.purchase,
      store: r.store, cert: r.cert,
    };
    try {
      const res = await api.setRetention(policy);
      wx.showToast({ title: '留存策略已保存', icon: 'success' });
      if (res && res.policy) this.setData({ retention: { ...res.policy, _default: DEFAULT_RETENTION_DAYS } });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingRetention: false });
    }
  },

  // 限流策略输入（按 group + field 更新 { window, max }）
  onRateInput(e) {
    const { g, f } = e.currentTarget.dataset;
    const v = parseInt(e.detail.value, 10);
    this.setData({ ['rate.' + g + '.' + f]: Number.isFinite(v) && v >= 0 ? v : 0 });
  },

  // 保存限流策略（仅管理员；后端写字典 + 审计日志 rate_limit_set）
  async onSaveRate() {
    const rate = this.data.rate;
    if (!rate) return;
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ savingRate: true });
    const policy = { default: rate.default, import: rate.import, batch: rate.batch };
    try {
      const res = await api.setRateLimit(policy);
      wx.showToast({ title: '限流策略已保存', icon: 'success' });
      if (res && res.policy) this.setData({ rate: res.policy });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingRate: false });
    }
  },

  // 刷新限流看板（拦截次数 + 策略变更次数 + 当前策略摘要）
  async onRefreshStats() {
    if (!this.data.isAdmin) return;
    this.setData({ loadingStats: true });
    const stats = await api.getRateStats().catch(() => null);
    let rateSummary = '';
    if (stats && stats.policy) {
      const p = stats.policy;
      const ws = (o) => (o && o.window ? Math.round(o.window / 1000) : 0);
      const mx = (o) => (o && o.max != null ? o.max : 0);
      rateSummary = `默认 ${ws(p.default)}s/${mx(p.default)} · 导入 ${ws(p.import)}s/${mx(p.import)} · 批量 ${ws(p.batch)}s/${mx(p.batch)}`;
    }
    this.setData({ rateStats: stats, rateSummary, loadingStats: false });
  },

  // 手动触发到期日志清理（仅管理员；后端写审计日志 cleanup_logs）
  async onCleanup() {
    const ok = await new Promise((resolve) => wx.showModal({
      title: '清理到期日志',
      content: '将永久删除已超过留存期的操作日志（留存策略之外的记录不受影响）。是否继续？',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    try { await network.requireOnline(); } catch (e) { return; }
    this.setData({ cleaning: true });
    try {
      const res = await api.cleanupLogs({});
      const removed = (res && res.removed) || 0;
      const before = (res && res.before) || '';
      this.setData({ lastClean: { removed, before } });
      wx.showToast({ title: '已清理 ' + removed + ' 条', icon: 'success' });
      this.onRefreshStats();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '清理失败', icon: 'none' });
    } finally {
      this.setData({ cleaning: false });
    }
  },
});
