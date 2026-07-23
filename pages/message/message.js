// pages/message/message.js —— 消息中心（M11 站内消息 + 预警）
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { SUBSCRIBE_TMPL_ID } = require('../../utils/constants');

const LEVEL_META = {
  urgent:   { label: '紧急', cls: 'danger', icon: '⛔' },
  important: { label: '重要', cls: 'warning', icon: '⚠️' },
  notice:   { label: '通知', cls: 'info',    icon: '📢' },
};

const TABS = [
  { key: '', label: '全部' },
  { key: 'notice', label: '通知' },
  { key: 'important', label: '重要' },
  { key: 'urgent', label: '紧急' },
];

function fmtTime(ts) {
  if (!ts) return '';
  const d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    list: [], raw: [],
    tabs: TABS, activeTab: '',
    stats: [],
    hasUnread: false,
    loading: true,
    // #14 批量管理
    batchMode: false,
    checkedIds: [],
  },

  async onLoad() {
    if (!(await auth.requireServerLogin())) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (!this.data.loading) this.load();
  },

  async load() {
    const res = await api.getWarnings({ page: 1, size: 30 }).catch(() => []);
    const raw = res || [];
    this.setData({ raw });
    this.applyFilter();
  },

  applyFilter() {
    const { raw, activeTab } = this.data;
    const list = (activeTab ? raw.filter((m) => m.level === activeTab) : raw).map((m) => {
      const meta = LEVEL_META[m.level] || LEVEL_META.notice;
      return { ...m, _cls: meta.cls, _icon: meta.icon, _time: fmtTime(m.createdAt || m.time) };
    });
    const counts = { '': raw.length, notice: 0, important: 0, urgent: 0 };
    raw.forEach((m) => { if (counts[m.level] != null) counts[m.level]++; });
    const tabs = this.data.tabs.map((t) => ({ ...t, count: counts[t.key] }));
    let unread = 0, warn = 0;
    raw.forEach((m) => { if (!m.read) unread++; if (m.level === 'urgent' || m.level === 'important') warn++; });
    this.setData({
      list,
      tabs,
      hasUnread: unread > 0,
      stats: [
        { label: '未读', value: unread, color: 'var(--c-danger)' },
        { label: '重要/紧急', value: warn, color: 'var(--c-warning)' },
        { label: '总计', value: raw.length, color: 'var(--c-primary)' },
      ],
      loading: false,
    });
  },

  onTab(e) {
    this.setData({ activeTab: e.detail.key });
    this.applyFilter();
  },

  async onTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    // 先标已读
    await api.readWarning(id).catch(() => {});
    const raw = this.data.raw.map((m) => (m._id === id ? { ...m, read: true } : m));
    this.setData({ raw });
    this.applyFilter();
    // 再按 refType 跳转
    const msg = raw.find((m) => m._id === id) || {};
    const refType = msg.refType;
    const ROUTES = {
      test:  '/pkg-test/pages/due-list/due-list',
      hazard: '/pkg-check/pages/hazard/hazard',
      scrap: '/pkg-scrap/pages/approve/approve',
      cert:  '/pkg-cert/pages/list/list',
    };
    const url = ROUTES[refType];
    if (url) {
      wx.navigateTo({
        url,
        fail: () => { /* 跳转失败时仅保留已读状态 */ },
      });
    }
  },

  onMarkAll() {
    if (!this.data.hasUnread) return;
    api.readAllWarnings().catch(() => {});
    const raw = this.data.raw.map((m) => ({ ...m, read: true }));
    wx.showToast({ title: '已全部标记已读', icon: 'success' });
    this.setData({ raw });
    this.applyFilter();
  },

  // 触发预警自动生成（M11.1）：扫描试验到期/超期、证书到期、隐患超期、报废异动
  async onGenerate() {
    wx.showLoading({ title: '生成预警中' });
    const r = await api.generateWarnings().catch(() => ({ generated: 0 }));
    wx.hideLoading();
    const n = (r && r.generated) || 0;
    wx.showToast({ title: n > 0 ? `新生成 ${n} 条预警` : '暂无新增预警', icon: n > 0 ? 'success' : 'none' });
    this.load();
  },

  // M11.2.1 微信订阅消息：用户自主确认订阅，后端记录订阅意图
  async onSubscribe() {
    const doRecord = () => api.subscribeWarning().catch(() => {});
    if (!SUBSCRIBE_TMPL_ID) {
      await doRecord();
      wx.showToast({ title: '已记录订阅意愿', icon: 'success' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TMPL_ID],
      success: async () => { await doRecord(); wx.showToast({ title: '订阅成功', icon: 'success' }); },
      fail: () => wx.showToast({ title: '已取消订阅', icon: 'none' }),
    });
  },

  // #14 批量管理：进入/退出批量模式
  onToggleBatchMode() {
    this.setData({ batchMode: !this.data.batchMode, checkedIds: [] });
  },

  // 勾选/取消勾选单条消息
  onCheckMsg(e) {
    const id = e.currentTarget.dataset.id;
    const checked = this.data.checkedIds.slice();
    const idx = checked.indexOf(id);
    if (idx >= 0) { checked.splice(idx, 1); } else { checked.push(id); }
    this.setData({ checkedIds: checked });
  },

  // 全选/取消全选当前可见消息
  onCheckAll() {
    const { list, checkedIds } = this.data;
    if (checkedIds.length === list.length) {
      this.setData({ checkedIds: [] });
    } else {
      this.setData({ checkedIds: list.map((m) => m._id) });
    }
  },

  // 批量标记已读
  async onBatchRead() {
    const ids = this.data.checkedIds;
    if (!ids.length) { wx.showToast({ title: '请先勾选消息', icon: 'none' }); return; }
    wx.showLoading({ title: '标记中' });
    await Promise.all(ids.map((id) => api.readWarning(id).catch(() => {})));
    wx.hideLoading();
    wx.showToast({ title: `已标记 ${ids.length} 条已读`, icon: 'success' });
    // 更新本地已读状态
    const raw = this.data.raw.map((m) => (ids.includes(m._id) ? { ...m, read: true } : m));
    this.setData({ raw, batchMode: false, checkedIds: [] });
    this.applyFilter();
  },

  // 批量删除
  async onBatchDelete() {
    const ids = this.data.checkedIds;
    if (!ids.length) { wx.showToast({ title: '请先勾选消息', icon: 'none' }); return; }
    wx.showModal({
      title: '确认删除', content: `确定删除 ${ids.length} 条消息？`,
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中' });
        const results = await Promise.all(ids.map((id) => api.deleteWarning(id).catch(() => null)));
        wx.hideLoading();
        const ok = results.filter((r) => r !== null).length;
        wx.showToast({ title: `已删除 ${ok} 条`, icon: 'success' });
        // 从本地移除
        const raw = this.data.raw.filter((m) => !ids.includes(m._id));
        this.setData({ raw, batchMode: false, checkedIds: [] });
        this.applyFilter();
      },
    });
  },
});
