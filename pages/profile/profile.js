// pages/profile/profile.js —— 我的（个人 / 资质 / 设置入口）
const api = require('../../utils/api');
const auth = require('../../utils/auth');

const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员', lease_admin: '租赁管理员',
};
const ADMIN_ROLES = ['lead', 'supervisor'];

Page({
  data: { profile: null, roleText: '', avatarText: '我', orgName: '', stats: [], groups: [] },

  onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.load();
  },

  async load() {
    const p = auth.getProfile();
    this.setData({
      profile: p,
      roleText: p ? (ROLE_TEXT[p.role] || p.role || '成员') : '',
      avatarText: (p && (p.nickName || p.username)) ? (p.nickName || p.username).charAt(0).toUpperCase() : '我',
      orgName: p && p.orgName ? p.orgName : '',
    });

    const s = await api.getMyStats().catch(() => null);
    const stats = [];
    if (s) {
      stats.push({ label: '待办', value: s.todo, color: 'var(--c-warning)' });
      stats.push({ label: '点检次数', value: s.checkCount, color: 'var(--c-primary)' });
      stats.push({ label: '达标率', value: (s.qualifiedRate || 0) + '%', color: 'var(--c-success)' });
    }
    const certBadge = s ? (s.todo || 0) : 0;
    this.setData({
      stats,
      groups: [
        {
          title: '账户与资质',
          items: [
            { key: 'profile', icon: '👤', label: '我的档案', value: p ? (ROLE_TEXT[p.role] || p.role) : '', arrow: true },
            { key: 'cert', icon: '📜', label: '持证管理', arrow: true },
            { key: 'cert-expire', icon: '⏰', label: '证书即将到期', badge: certBadge ? String(certBadge) : '', arrow: true },
          ],
        },
        ...(ADMIN_ROLES.includes(p && p.role) ? [{
          title: '系统管理',
          items: [
            { key: 'system', icon: '⚙️', label: '组织架构与用户', value: '管理员', arrow: true },
          ],
        }] : []),
        {
          title: '通用',
          items: [
            { key: 'about', icon: 'ℹ️', label: '关于系统', value: 'V1.0', arrow: true },
            { key: 'logout', icon: '🚪', label: '退出登录', danger: true, arrow: true },
          ],
        },
      ],
    });
  },

  onSelect(e) {
    const key = e.detail.key;
    if (key === 'logout') return this.onLogout();
    if (key === 'about') { wx.showModal({ title: '关于系统', content: '工器具安全管理小程序 V1.0\n助力电力工器具全生命周期安全管控。', showCancel: false }); return; }
    if (key === 'system') { wx.navigateTo({ url: '/pkg-system/pages/org/org' }); return; }
    wx.showToast({ title: '该功能开发中', icon: 'none' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      success: (r) => {
        if (!r.confirm) return;
        auth.logout();
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },
});
