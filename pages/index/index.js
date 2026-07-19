// pages/index/index.js —— 工作台（角色化九宫格 + 待办）
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { moduleGroups } = require('../../utils/modules');
const theme = require('../../utils/theme');
const app = getApp();

const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员', lease_admin: '租赁管理员', admin: '小程序管理员',
};

function greetingByHour(h) {
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function buildTodos(d) {
  const todos = [];
  if (d.warnings) todos.push({ key: 'warn', title: d.warnings + ' 条未读预警', desc: '及时处理试验超期与禁用告警', level: 'urgent' });
  if (d.pendingTest) todos.push({ key: 'test', title: d.pendingTest + ' 件器具待检', desc: '安排周期试验，避免超期', level: 'important' });
  if (d.expiringSoon) todos.push({ key: 'expire', title: d.expiringSoon + ' 件即将临期', desc: '关注有效期，防止禁用外流', level: 'notice' });
  return todos;
}

// 把后端聚合的模块徽标挂到九宫格：仅当该模块有积压时才带 badge（节奏而非堆砌）
function attachBadges(groups, status) {
  if (!groups || !groups.length || !status) return groups;
  return groups.map((g) => ({
    ...g,
    items: g.items.map((it) => {
      const s = status[it.key];
      return { ...it, badge: s && s.count ? { count: s.count, tone: s.tone } : null };
    }),
  }));
}

Page({
  data: {
    profile: null,
    roleText: '',
    avatarText: '工',
    greeting: '你好',
    todayText: '',
    dashboard: null,
    stats: [],
    todos: [],
    modules: [],
    groups: [],
    loading: true,
  },

  onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    auth.ensureLogin().catch(() => {});
    this.setData({ themeClass: theme.classOf(app.globalData.theme) });
    // 轻量同步：重新拉取模块徽标聚合 + 应用最新档案（角色/组织变更后回看即更新）
    this.refreshBadges();
    // 订阅「档案变更」事件（Item 5）：角色/组织变更后实时刷新首页徽标与档案，无需重复进入
    if (!this._offProfile) this._offProfile = auth.onProfileChanged(() => this.refresh());
  },

  onHide() { if (this._offProfile) { this._offProfile(); this._offProfile = null; } },
  onUnload() { if (this._offProfile) { this._offProfile(); this._offProfile = null; } },

  async onLoad() {
    if (!(await auth.requireServerLogin())) return;
    this.refresh();
  },

  onPullDownRefresh() { this.refresh().then(() => wx.stopPullDownRefresh()); },

  // 仅刷新模块徽标聚合（九宫格状态徽标），避免每次 onShow 都拉全量看板
  async refreshBadges() {
    const hs = await api.getHomeStatus().catch(() => null);
    if (hs) this._hs = hs;
    this.applyProfile(auth.getProfile());
  },

  applyProfile(p) {
    if (!p) {
      this.setData({ profile: null, roleText: '', avatarText: '工', modules: [], groups: attachBadges(moduleGroups(null), this._hs) });
      return;
    }
    const name = p.nickName || p.username || '';
    this.setData({
      profile: p,
      roleText: ROLE_TEXT[p.role] || '成员',
      avatarText: (name ? name[0] : '工').toUpperCase(),
      modules: [],           // 兼容旧字段（保留，避免其它引用报错）
      groups: attachBadges(moduleGroups(p.role), this._hs),
    });
  },

  async refresh() {
    this.setData({ loading: true });
    const now = new Date();
    this.setData({ greeting: greetingByHour(now.getHours()), todayText: `${now.getMonth() + 1}月${now.getDate()}日` });
    const p = auth.getProfile() || (await auth.ensureLogin().catch(() => null));
    // 模块徽标聚合：先取一次并缓存，onShow 切回时直接复用，无需重复请求
    const hs = await api.getHomeStatus().catch(() => null);
    if (hs) this._hs = hs;
    this.applyProfile(p);
    const d = await api.getDashboard().catch(() => null);
    if (d) {
      this.setData({
        dashboard: d,
        stats: [
          { label: '器具总数', value: d.total, color: 'var(--c-primary)' },
          { label: '合格', value: d.qualified, color: 'var(--c-success)' },
          { label: '待检', value: d.pendingTest, color: 'var(--c-warning)' },
          { label: '超期预警', value: d.expiringSoon, color: 'var(--c-danger)' },
        ],
        todos: buildTodos(d),
      });
    }
    this.setData({ loading: false });
  },

  onModule(e) {
    const { url, tab } = e.currentTarget.dataset;
    if (!url) return;
    if (tab) wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  goLedger() { wx.switchTab({ url: '/pages/ledger/ledger' }); },
});
