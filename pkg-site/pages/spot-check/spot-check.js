// pkg-site/pages/spot-check/spot-check.js —— M6 现场点检（含今日点检概况，原 daily-check 页已合并）
const api = require('../../../utils/api');
const network = require('../../../utils/network');
const { TOOL_CATEGORIES } = require('../../../utils/constants');

Page({
  data: {
    taskDate: '',
    items: [],        // [{ text, result }] 点检模板
    toolId: '',
    abnormal: false,
    remark: '',
    submitting: false,
    // 今日点检概况（原每日点检看板数据：dailyList → spot_checks 按日 join tools）
    loading: false,
    date: '',
    total: 0,
    done: 0,
    rate: 0,
    summary: [],      // [{ toolId, name, code, category, categoryText, status, ts }]
  },

  async onLoad(opts) {
    // 从台账详情 drill-down 带入的器具编号，预填到表单
    if (opts && opts.toolId) this.setData({ toolId: opts.toolId });
    const task = await api.getSpotCheckTask().catch(() => null);
    if (task && task.items) {
      const items = (task.items || []).map((t) => ({
        text: typeof t === 'string' ? t : (t.text || t.name || ''),
        result: '合格',
      }));
      this.setData({ taskDate: task.date || '', items });
    }
  },

  onShow() { this.loadDaily(); },

  // 今日点检概况：dailyList 已按组织子树收窄并派生 done/rate，此处仅补类别文案映射
  async loadDaily() {
    this.setData({ loading: true });
    try {
      const d = await api.getDailyCheck();
      if (!d || !d.items) return;
      const map = {};
      TOOL_CATEGORIES.forEach((c) => { map[c.code] = c.name; });
      const summary = (d.items || []).map((it) => Object.assign({}, it, { categoryText: map[it.category] || it.category || '' }));
      this.setData({ date: d.date || '', total: d.total || 0, done: d.done || 0, rate: d.rate || 0, summary });
    } catch (e) { /* 概况加载失败不阻塞表单 */ }
    finally { this.setData({ loading: false }); }
  },

  bindToolId(e) { this.setData({ toolId: e.detail.value }); },
  // 优化#12：编号联想选中回填（code-autocomplete 组件）
  onPickCode(e) { this.setData({ toolId: e.detail.code || '' }); },
  bindRemark(e) { this.setData({ remark: e.detail.value }); },
  onAbnormal(e) { this.setData({ abnormal: e.detail.value }); },

  onToggle(e) {
    const i = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    items[i] = Object.assign({}, items[i], { result: e.detail.value ? '合格' : '异常' });
    this.setData({ items });
  },

  // 待检行点击：预填器具编号并滚动到表单（原 daily-check 是跳页，合并后同页直达）
  onTapItem(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.status !== 'pending') return;
    this.setData({ toolId: item.toolId || item.code || '' });
    this.scrollToForm();
  },

  // ＋ 新增点检：清空预填并聚焦表单
  goCheck() {
    this.setData({ toolId: '' });
    this.scrollToForm();
  },

  scrollToForm() {
    wx.createSelectorQuery().select('#check-form').boundingClientRect((rect) => {
      if (rect) wx.pageScrollTo({ scrollTop: rect.top, duration: 200 });
    }).exec();
  },

  // 子功能导航：操作规程 / 班前交底（原 daily-check subnav，合并后保留）
  onGo(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    if (!this.data.items.length) {
      wx.showToast({ title: '暂无可点检项', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.submitSpotCheck({
        toolId: this.data.toolId,
        items: this.data.items,
        abnormal: this.data.abnormal,
        remark: this.data.remark,
      });
      wx.showToast({ title: '点检已提交，可继续点检下一项', icon: 'success', duration: 1500 });
      // 提交后清空表单并刷新今日概况，留在当前页支持连续点检多个工器具
      this.setData({ toolId: '', items: [], abnormal: false, remark: '' });
      this.loadDaily();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
