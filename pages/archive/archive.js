// pages/archive/archive.js —— 我的档案（问题 #5）
// 全面档案信息页：与身份码页（简洁）互补——档案展示完整归属/权限，身份码用于现场互扫。
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { ROLE_TEXT } = require('../../utils/constants');
const { orgPath } = require('../../utils/org-utils');
const { ROLE_INFO } = require('../../utils/register-shared');

Page({
  data: {
    profile: null,
    roleText: '',
    avatarText: '我',
    orgPathText: '',
    orgPathArr: [],
    info: [],       // 全面档案行 [{ label, value }]
    roleInfo: null, // 权限说明（ROLE_INFO）
    stats: [],      // 统计卡（与 profile 页同源口径）
  },

  async onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    if (!p) return;

    // 归属单位/机构：users 无冗余 orgName，按 orgId 从组织树解析完整路径（问题 #2 同源逻辑）
    let orgArr = [];
    if (p.orgId) {
      const tree = await api.getOrgTree().catch(() => []);
      orgArr = orgPath(tree, p.orgId);
    }
    const roleText = ROLE_TEXT[p.role] || p.role || '成员';
    const info = [
      { label: '用户名', value: p.username || '—' },
      { label: '昵称', value: p.nickname || '—' },
      { label: '角色', value: roleText },
      { label: '工号', value: p.employeeId || '—' },
      { label: '所属单位', value: orgArr[0] || '—' },
      { label: '机构 / 班组', value: orgArr.slice(1).join(' / ') || '—' },
    ];

    // 统计卡（与 profile 页同源：myStats 三项）
    const s = await api.getMyStats().catch(() => null);
    const stats = [];
    if (s) {
      stats.push({ label: '待办', value: s.todo, color: 'var(--c-warning)' });
      stats.push({ label: '点检次数', value: s.checkCount, color: 'var(--c-primary)' });
      stats.push({ label: '达标率', value: (s.qualifiedRate || 0) + '%', color: 'var(--c-success)' });
    }

    this.setData({
      profile: p,
      roleText,
      avatarText: (p.nickname || p.username || '我').charAt(0).toUpperCase(),
      orgPathText: orgArr.join(' / '),
      orgPathArr: orgArr,
      info,
      stats,
      roleInfo: ROLE_INFO[p.role] || null,
    });
  },

  goIdentity() { wx.navigateTo({ url: '/pages/identity/identity' }); },
  goPermission() { wx.navigateTo({ url: '/pages/permission/permission' }); },
});
