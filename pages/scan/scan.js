// pages/scan/scan.js —— 扫码中枢（M14）：扫码后跳转器具档案 / 按角色路由
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const network = require('../../utils/network');

const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员', lease_admin: '租赁管理员',
};

Page({
  data: {
    role: '',
    roleText: '',
    recent: [],
    notice: [
      '核对器具编号与系统一致',
      '合格且在有效期内的器具方可领用',
      '报废、禁用、超期器具禁止领用',
    ],
  },

  async onLoad() {
    // 进入扫码中枢前先服务端校验登录态
    if (!(await auth.requireServerLogin())) return;
    // FEAT-04：恢复上次扫码历史（跨会话保留，便于连续巡检）
    const recent = (() => { try { return wx.getStorageSync('scanHistory') || []; } catch (_) { return []; } })();
    if (recent.length) this.setData({ recent });
  },

  onShow() {
    // 问题1：未登录拦截
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    // 确保登录态，避免角色显示「未登录」
    auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    this.setData({
      role: p ? p.role : '',
      roleText: p ? (ROLE_TEXT[p.role] || '成员') : '',
    });
  },

  async onScan() {
    // 无网络提示（M5.1.5 / M6.1.5）
    try { await network.requireOnline(); } catch (e) { return; }

    wx.scanCode({
      success: async (res) => {
        const code = res.result;
        // #13 身份码：前缀区分器具码，扫码互验身份
        if (code && code.indexOf('AISND|ID|') === 0) {
          this.verifyIdentity(code.slice('AISND|ID|'.length));
          return;
        }
        const tool = await api.getToolDetail(code).catch(() => null);
        if (!tool) { wx.showToast({ title: '未识别的器具', icon: 'none' }); return; }
        const recent = this.data.recent.filter((r) => r._id !== tool._id).slice(0, 4);
        recent.unshift({ _id: tool._id, name: tool.name, status: tool.status, code: tool.code || code });
        this.setData({ recent });
        // FEAT-04：持久化扫码历史
        try { wx.setStorageSync('scanHistory', recent); } catch (_) {}
        wx.showToast({ title: '扫码成功：' + tool.name, icon: 'none' });
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + (tool._id || code) });
        }, 600);
      },
      fail: () => {},
    });
  },

  // #13 身份码核验：解析负载并展示被扫码人身份（离线可读，后续可加签名防伪）
  verifyIdentity(jsonStr) {
    let p;
    try { p = JSON.parse(jsonStr); } catch (e) {
      wx.showToast({ title: '无法识别身份码', icon: 'none' });
      return;
    }
    const name = (p && p.n) || '未知用户';
    const eid = (p && p.e) || '';
    const role = ROLE_TEXT[(p && p.r)] || '成员';
    wx.showModal({
      title: '身份核验',
      content: `姓名：${name}\n工号：${eid || '—'}\n角色：${role}`,
      showCancel: false,
      confirmText: '已核验',
    });
  },

  onManual() {
    wx.showModal({
      title: '手动输入编号',
      editable: true,
      placeholderText: '请输入器具编号 / 二维码内容',
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        const tool = await api.getToolDetail(r.content.trim()).catch(() => null);
        if (!tool) { wx.showToast({ title: '未找到该器具', icon: 'none' }); return; }
        wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + (tool._id || r.content.trim()) });
      },
    });
  },

  onTapRecent(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + id });
  },
});
