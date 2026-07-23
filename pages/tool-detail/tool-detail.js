// pages/tool-detail/tool-detail.js —— 器具详情「一物一档」（多模块共享）
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const network = require('../../utils/network');
const { buildFlow } = require('../../utils/flow');
const theme = require('../../utils/theme');
const app = getApp();

Page({
  data: { id: '', tool: null, loading: true, timeline: [], actions: [], banner: null, flow: null, themeClass: '' },

  onLoad(opts) {
    if (!opts.id) {
      wx.showToast({ title: '缺少器具ID', icon: 'none' });
      return;
    }
    this.setData({ id: opts.id });
    this.load(opts.id);
  },

  onShow() {
    this.setData({ themeClass: theme.classOf(app.globalData.theme) });
  },

  async load(id) {
    const t = await api.getToolDetail(id).catch(() => null);
    if (!t) { this.setData({ loading: false }); return; }

    // 履历时间线（试验 + 操作记录，按时间倒序）
    const timeline = [];
    (t.testRecords || []).forEach((r) => timeline.push({
      time: r.date || '',
      type: 'test',
      title: '周期试验',
      desc: r.result || '',
      status: r.result === '合格' ? 'success' : 'warning',
      operatorName: r.operator || '', // 试验操作人（已是姓名）
    }));
    (t.operations || []).forEach((o) => timeline.push({
      time: o.ts || o.time || '',
      type: 'op',
      title: o.action || o.title || '状态变更',
      desc: o.desc || '',
      status: 'normal',
      operatorName: o.operatorName || '', // R18 后端富化的操作人姓名（来自 by openid）
    }));
    timeline.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    // 领用→归还生命周期步进器（以器具状态推导）
    const flow = buildFlow('borrow', t.status);
    this.setData({ tool: t, timeline, flow, loading: false });
    this.buildBanner(t);
    this.buildActions(t);
  },

  buildBanner(t) {
    if (t.status === 'forbidden') return this.setData({ banner: { cls: 'danger', text: '该器具已被禁用，禁止领用、归还、外流' } });
    if (t.status === 'scrapped') return this.setData({ banner: { cls: 'danger', text: '该器具已报废，不再参与使用流转' } });
    if (t.expired) return this.setData({ banner: { cls: 'warning', text: '试验有效期已超期，须重新试验合格后方可使用' } });
    this.setData({ banner: null });
  },

  // 角色 + 状态 双重约束的可执行操作（M14.1.4）
  buildActions(t) {
    const profile = auth.getProfile();
    const role = profile ? profile.role : '';
    const st = t.status;
    const actions = [];
    if (st === 'qualified' && !t.expired) {
      actions.push({ key: 'borrow', label: '领用', primary: true });
    } else if (st === 'in_use') {
      actions.push({ key: 'return', label: '归还', primary: true });
    }
    if (['worker', 'group_lead', 'safety_officer'].includes(role)) {
      actions.push({ key: 'check', label: '点检' });
    }
    if (st !== 'scrapped' && st !== 'forbidden') {
      actions.push({ key: 'repair', label: '报修' });
    }
    if (auth.can('scrap', t)) {
      actions.push({ key: 'scrap', label: '报废' });
    }
    // 编辑入口（M1.3.4）：安全员/班组长/租赁管理员/专班可改档案
    if (auth.isSafety() || ['lead', 'group_lead', 'lease_admin'].includes(role)) {
      actions.push({ key: 'edit', label: '编辑' });
    }
    this.setData({ actions: actions.slice(0, 4) });
  },

  async onAction(e) {
    const key = e.currentTarget.dataset.key;
    const id = this.data.id;
    // 领用 / 归还：直接调云函数（M5.1.1 / M5.2.1），后端做资格校验与外观检查
    if (key === 'borrow' || key === 'return') {
      try { await network.requireOnline(); } catch (err) { return; } // M5.1.5 无网络提示
      wx.showLoading({ title: '处理中' });
      try {
        if (key === 'borrow') {
          await api.borrowTool(id); // 后端校验合格/有效期/持证（M5.1.2）
          wx.showToast({ title: '领用成功', icon: 'success' });
        } else {
          const pick = await new Promise((resolve) => {
            wx.showActionSheet({
              itemList: ['外观正常', '外观损坏'],
              success: (res) => resolve(res.tapIndex === 1 ? 'damaged' : 'normal'),
              fail: () => resolve(null),
            });
          });
          if (!pick) { wx.hideLoading(); return; }
          await api.returnTool(id, { appearance: pick }); // 损坏→维修（M5.2.2）
          wx.showToast({ title: pick === 'damaged' ? '已归还（损坏转维修）' : '归还成功', icon: 'success' });
        }
        this.load(id); // 刷新状态与履历
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      } finally { wx.hideLoading(); }
      return;
    }
    const routes = {
      check: '/pkg-site/pages/spot-check/spot-check?toolId=' + id,
      repair: '/pkg-maint/pages/repair/repair',
      scrap: '/pkg-scrap/pages/apply/apply',
      edit: '/pkg-ledger/pages/tool-create/tool-create?id=' + id,
    };
    const url = routes[key];
    if (url) wx.navigateTo({ url });
    else wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  onBack() { wx.navigateBack(); },
});
