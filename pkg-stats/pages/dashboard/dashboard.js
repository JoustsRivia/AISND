// pkg-stats/pages/dashboard/dashboard.js —— M12.1 统计分析看板
const api = require('../../../utils/api');
const theme = require('../../../utils/theme');
const app = getApp();

// 状态分布配色（canvas 需具体色值，对应设计令牌）
const C = {
  qualified: '#059669', pending: '#D97706', maint: '#7C3AED',
  missing: '#DC2626', scrapped: '#6B7280', primary: '#1A56DB',
};

// 六化达标区块可见角色：与服务端 stats/index.js 的 SENSITIVE_ROLES 同源对齐
// （原独立页有 ensureRole 门控，合并进看板后由前端按同一词表显隐，不改变权限语义）
// 与服务端 stats/index.js SENSITIVE_ROLES 同源（单位级及以上管理码）
const SIX_ROLES = ['admin', 'a1', 'a2', 'b11', 'b12', 'c11', 'c12'];

Page({
  data: {
    loading: true, items: [], trend: [], maxTrend: 1,
    statusPie: [], trendSeries: [], themeClass: '',
    dims: [],   // 六化达标六项（原独立页并入看板区块）
  },

  onShow() {
    this.setData({ themeClass: theme.classOf(app.globalData.theme) });
  },

  async onLoad() {
    const d = await api.getDashboard().catch(() => null);
    if (d) {
      this.setData({
        items: [
          { label: '器具总数', value: d.total, color: 'var(--c-primary)' },
          { label: '合格', value: d.qualified, color: 'var(--c-success)' },
          { label: '待检', value: d.pendingTest, color: 'var(--c-warning)' },
          { label: '报废', value: d.scrapped, color: 'var(--c-danger)' },
          { label: '维修中', value: d.maintaining },
          { label: '超期预警', value: d.expiringSoon },
          { label: '未读预警', value: d.warnings, color: 'var(--c-danger)' },
        ],
        // 状态分布饼图
        statusPie: [
          { name: '合格', value: d.qualified || 0, color: C.qualified },
          { name: '待检', value: d.pendingTest || 0, color: C.pending },
          { name: '维修中', value: d.maintaining || 0, color: C.maint },
          { name: '缺失', value: d.missing || 0, color: C.missing },
          { name: '报废', value: d.scrapped || 0, color: C.scrapped },
        ],
      });
    }
    const t = await api.getTrend({ days: 7 }).catch(() => []);
    const trend = (t || []).map((x) => ({ date: (x.date || '').slice(5), total: x.total || 0 }));
    const maxTrend = Math.max(1, ...trend.map((x) => x.total));
    // 趋势折线
    const trendSeries = trend.map((x) => ({ name: x.date, value: x.total, color: C.primary }));
    this.setData({ trend, trendSeries, maxTrend, loading: false });
    // 六化达标区块（原独立页已并入；后台加载不阻塞看板主体）
    this.loadSix();
  },

  async loadSix() {
    try {
      const me = await api.getMyProfile();
      if (!me || !SIX_ROLES.includes(me.role)) return;
      const s = await api.getSixStandard();
      if (s && s.dims) this.setData({ dims: s.dims });
    } catch (e) { /* 六化区块非主流程，失败不打断看板 */ }
  },

  goReport() { wx.navigateTo({ url: '/pkg-stats/pages/report/report' }); },
  goTeam() { wx.navigateTo({ url: '/pkg-stats/pages/team/team' }); },
});
