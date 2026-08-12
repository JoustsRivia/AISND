// pages/tool-detail/tool-detail.js —— 器具详情「一物一档」（多模块共享）
// 2026-08-08：用户提供原件恢复（此前文件因历史编码问题被截断，重建版遗漏了 resolveUser
// keeper 姓名富化与 testRecords 试验履历）；在原件基础上应用词表统一后的角色判定与问题 #7 报修路由修复。
const api = require('../../utils/api');

// 优化#18：时间线时间统一格式化——ops 的 ts 是 Date 对象，直接渲染会显示英文长格式
// （Sat Aug 08 2026 ...）；先格式化为 YYYY/MM/DD HH:mm:ss 再排序（字符串字典序=时间序）
function fmtDateTime(v) {
  if (!v) return '';
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const auth = require('../../utils/auth');
const network = require('../../utils/network');
const { buildFlow } = require('../../utils/flow');
const { resolveUser } = require('../../utils/user-utils');
const { orgPathText } = require('../../utils/org-utils'); // 优化#10：台账层级路径解析
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

    // keeper 可能存的是 openid → 解析为姓名+工号
    const keeperDisplay = t.keeper ? await resolveUser(t.keeper).catch(() => t.keeper) : '';
    // 优化#10：台账层级——按 orgId 从组织树解析完整路径展示
    let orgText = '';
    if (t.orgId) {
      const tree = await api.getOrgTree().catch(() => []);
      orgText = orgPathText(tree, t.orgId);
    }
    const toolWithDisplay = {
      ...t,
      keeperDisplay, orgText,
      // 日期统一 yyyy-mm-dd（禁止 UTC/ISO 直显）
      expireAt: fmtDate(t.expireAt),
      lastTestDate: fmtDate(t.lastTestDate),
      purchaseDate: fmtDate(t.purchaseDate),
    };

    // 履历时间线（试验 + 操作记录，按时间倒序）
    const timeline = [];
    (t.testRecords || []).forEach((r) => timeline.push({
      time: fmtDateTime(r.date || r.time || ''), // 优化#18：统一 YYYY/MM/DD HH:mm:ss
      type: 'test',
      title: '周期试验',
      desc: r.result || '',
      status: r.result === '合格' ? 'success' : 'warning',
      operatorName: r.operator || '', // 试验操作人（已是姓名）
    }));
    // 优化#11：操作记录按 type 细化标题（原逻辑只读 action/title，而写入方存的是 type → 全部显示「状态变更」）
    const OP_LABELS = {
      borrow: '领用', return: '归还', scrap: '报废', created: '入库建档',
    };
    (t.operations || []).forEach((o) => timeline.push({
      time: fmtDateTime(o.ts || o.time || ''), // 优化#18：Date 对象统一格式化（原直渲英文长格式）
      type: 'op',
      title: OP_LABELS[o.type] || o.action || o.title || '状态变更',
      desc: o.note || o.desc || '',
      status: o.type === 'scrap' ? 'warning' : 'normal',
      operatorName: o.operatorName || '', // R18 后端富化的操作人姓名（来自 by openid）
    }));
    timeline.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    // 领用→归还生命周期步进器（以器具状态推导）
    const flow = buildFlow('borrow', t.status);
    this.setData({ tool: toolWithDisplay, timeline, flow, loading: false });
    this.buildBanner(toolWithDisplay);
    this.buildActions(toolWithDisplay);
  },

  buildBanner(t) {
    if (t.status === 'forbidden') return this.setData({ banner: { cls: 'danger', text: '该器具已被禁用，禁止领用、归还、外借' } });
    if (t.status === 'scrapped') return this.setData({ banner: { cls: 'danger', text: '该器具已报废，不再参与使用流转' } });
    if (t.expired) return this.setData({ banner: { cls: 'warning', text: '试验有效期已超期，须重新试验合格后方可使用' } });
    this.setData({ banner: null });
  },

  // 角色 + 状态双重约束的可执行操作（M14.1.4；词表统一后判定）
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
    // 点检：班组作业层 + 项目部安全员（原 worker/group_lead/safety_officer 语义）
    if (['b22', 'b23', 'b24', 'c22', 'c23', 'c24'].includes(role)) {
      actions.push({ key: 'check', label: '点检' });
    }
    if (st !== 'scrapped' && st !== 'forbidden') {
      actions.push({ key: 'repair', label: '报修' });
    }
    if (auth.can('scrap', t)) {
      actions.push({ key: 'scrap', label: '报废' });
    }
    // 编辑入口（M1.3.4）：管理族（isLead）或班组长可改档案（原安全员/班组长/租赁管理员/专班语义）
    if (st !== 'scrapped' && st !== 'forbidden' && (auth.isLead() || ['b23', 'c23'].includes(role))) {
      actions.push({ key: 'edit', label: '编辑' });
    }
    // 优化#7 删除入口（服务端 del 权威校验：管理族或本人机构、非 in_use 可删）：
    // 管理族 or 工具归属本人机构；恒定占位最右且带 danger 样式
    const canDelete = auth.isLead() || !!(profile && profile.orgId && t.orgId && profile.orgId === t.orgId);
    const list = actions.slice(0, 4);
    if (canDelete) {
      if (list.length >= 4) list.pop();
      list.push({ key: 'delete', label: '删除', danger: true });
    }
    this.setData({ actions: list });
  },

  async onAction(e) {
    const key = e.currentTarget.dataset.key;
    const id = this.data.id;
    // 领用 / 归还：直接调云函数（M5.1.1 / M5.2.1），后端做资格校验与外观检查
    if (key === 'borrow' || key === 'return') {
      try { await network.requireOnline(); } catch (err) { wx.showToast({ title: '当前无网络，请检查网络连接', icon: 'none' }); return; } // M5.1.5 无网络提示
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
    // 优化#7 删除器具：二次确认弹窗防误删，成功后返回上一页
    if (key === 'delete') {
      const name = (this.data.tool && this.data.tool.name) || '该器具';
      wx.showModal({
        title: '删除器具',
        content: `确定删除「${name}」？删除后不可恢复，且其履历将无法查询。`,
        confirmText: '删除',
        confirmColor: '#E5484D',
        success: async (res) => {
          if (!res.confirm) return;
          wx.showLoading({ title: '删除中' });
          try {
            await api.deleteTool(id);
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 600);
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          }
        },
      });
      return;
    }
    const routes = {
      check: '/pkg-site/pages/spot-check/spot-check?toolId=' + id,
      repair: '/pkg-maint/pages/create/create?toolId=' + id, // 问题 #7：报修入口跳发起页并携带器具（原跳 repair 列表页是断点）
      scrap: '/pkg-scrap/pages/apply/apply',
      edit: '/pkg-ledger/pages/tool-create/tool-create?id=' + id,
    };
    const url = routes[key];
    if (url) wx.navigateTo({ url });
    else wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  onBack() { wx.navigateBack(); },
});
