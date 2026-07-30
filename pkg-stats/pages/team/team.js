// pkg-stats/pages/team/team.js —— M12.2 班组协作看板（NEW-04）
// 面向班组长 / 项目部：一屏掌握本班组器具状态、成员与近期动态，支撑现场协作。
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');
const theme = require('../../../utils/theme');
const { subtreeIds } = require('../../../utils/org-utils');
const app = getApp();

const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员',
  lease_admin: '租赁管理员', admin: '管理员',
};

function fmtTime(ts) {
  if (!ts) return '';
  const d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    loading: true, themeClass: '',
    teamName: '', memberCount: 0,
    stats: [], warnings: 0,
    members: [], activities: [],
  },

  onShow() {
    this.setData({ themeClass: theme.classOf(app.globalData.theme) });
  },

  async onLoad() {
    const p = auth.getProfile() || (await auth.ensureLogin().catch(() => null));
    const orgId = p && p.orgId;

    const tree = await api.getOrgTree().catch(() => []);
    let teamName = (p && p.orgName) || '';
    let orgSet = orgId ? new Set([orgId]) : new Set();
    if (tree.length && orgId) {
      teamName = (tree.find((o) => o._id === orgId) || {}).name || teamName;
      orgSet = new Set(subtreeIds(tree, orgId));
    }

    const [users, stats, warns, records] = await Promise.all([
      api.listUsers().catch(() => []),
      api.getLedgerStats(orgId ? { orgId } : {}).catch(() => null),
      api.getWarnings({ page: 1, size: 50 }).catch(() => []),
      api.getBorrowRecords({ page: 1, size: 8 }).catch(() => []),
    ]);

    const members = (users || []).filter((u) => !orgId || orgSet.has(u.orgId)).slice(0, 12);
    const memberList = members.map((u) => ({
      name: u.nickname || u.username || '成员',
      role: ROLE_TEXT[u.role] || '成员',
      employeeId: u.employeeId || '',
    }));

    const s = stats || {};
    const statCards = [
      { label: '器具总数', value: s.total || 0, color: 'var(--c-primary)' },
      { label: '合格', value: s.qualified || 0, color: 'var(--c-success)' },
      { label: '待检', value: s.pendingTest || 0, color: 'var(--c-warning)' },
      { label: '领用中', value: s.inUse || 0, color: 'var(--c-info)' },
      { label: '维修中', value: s.maintaining || 0, color: 'var(--c-primary)' },
      { label: '报废', value: s.scrapped || 0, color: 'var(--c-text-weak)' },
    ];

    const unread = (warns || []).filter((w) => !w.read).length;
    const recArr = Array.isArray(records) ? records : ((records && records.list) || []);
    const activities = recArr.map((r) => ({
      text: `${r.userName || r.keeper || '成员'} ${r.toolName || r.code || '器具'}`,
      time: fmtTime(r.ts || r.createdAt || r.time),
    }));

    this.setData({
      loading: false,
      teamName, memberCount: memberList.length,
      stats: statCards, warnings: unread,
      members: memberList, activities,
    });
  },

  goDashboard() {
    wx.navigateBack().catch(() => wx.switchTab({ url: '/pages/index/index' }));
  },
});
