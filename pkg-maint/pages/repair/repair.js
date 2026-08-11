// pkg-maint/pages/repair/repair.js —— M7 报修处理（通过 / 维修登记 / 复检 / 归档 / 删除）
const api = require('../../../utils/api');
const auth = require('../../../utils/auth');
const network = require('../../../utils/network');
const { ROLE_FAMILIES } = require('../../../utils/constants');
const { buildFlow } = require('../../../utils/flow');

// 管理族判定（与服务端 maintenance requireApprover 同源：MGMT + admin）
const isMgmt = () => {
  const p = auth.getProfile();
  return !!(p && (p.role === 'admin' || ROLE_FAMILIES.MGMT.includes(p.role)));
};

Page({
  data: {
    list: [],        // [{ _id, toolId, toolName, toolCode, fault, desc, status, reporter }]
    selectedId: '',
    loading: true,
    acting: false,   // 操作按钮 loading 态，避免重复点击
    canMgmt: false,  // 管理族：归档/删除按钮显隐（问题 #7）
  },

  async onLoad() {
    this.setData({ canMgmt: isMgmt() });
    await this.reload();
  },

  async onShow() {
    this.setData({ canMgmt: isMgmt() });
    await this.reload();
  },

  async reload() {
    this.setData({ loading: true });
    const list = await api.getRepairList({}).catch(() => []);
    // 注入流程阶段（报修→审批→维修→复检），让处理进度被感知
    const list2 = (list || []).map((it) => ({ ...it, flow: buildFlow('repair', it.status) }));
    this.setData({ list: list2, loading: false });
  },

  onTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedId: this.data.selectedId === id ? '' : id });
  },

  getSelected() {
    return this.data.list.find((it) => it._id === this.data.selectedId);
  },

  async onApprove() {
    if (this.data.acting) return;
    try { await network.requireOnline(); } catch (e) { return; }
    const it = this.getSelected();
    if (!it) return;
    this.setData({ acting: true });
    try {
      await api.approveRepair(it._id);
      wx.showToast({ title: '已通过', icon: 'success' });
      this.setData({ selectedId: '' });
      await this.reload();
    } catch (err) { wx.showToast({ title: '操作失败', icon: 'none' }); }
    finally { this.setData({ acting: false }); }
  },

  async onRecord() {
    if (this.data.acting) return;
    try { await network.requireOnline(); } catch (e) { return; }
    const it = this.getSelected();
    if (!it) return;
    const d1 = await wx.showModal({ title: '维修登记', editable: true, placeholderText: '维修内容 / 处理措施' });
    if (!d1.confirm) return;
    const repairDetail = (d1.content || '').trim();
    if (!repairDetail) { wx.showToast({ title: '请填写维修内容', icon: 'none' }); return; }
    const d2 = await wx.showModal({ title: '维修费用', editable: true, placeholderText: '费用（元），可留空' });
    if (!d2.confirm) return;
    const cost = (d2.content || '').trim();
    this.setData({ acting: true });
    try {
      await api.recordRepair({ id: it._id, repairDetail, cost });
      wx.showToast({ title: '已登记', icon: 'success' });
      this.setData({ selectedId: '' });
      await this.reload();
    } catch (err) { wx.showToast({ title: '操作失败', icon: 'none' }); }
    finally { this.setData({ acting: false }); }
  },

  async onRecheck() {
    if (this.data.acting) return;
    try { await network.requireOnline(); } catch (e) { return; }
    const it = this.getSelected();
    if (!it) return;
    this.setData({ acting: true });
    try {
      await api.recheckRepair(it._id);
      wx.showToast({ title: '复检合格', icon: 'success' });
      this.setData({ selectedId: '' });
      await this.reload();
    } catch (err) { wx.showToast({ title: '操作失败', icon: 'none' }); }
    finally { this.setData({ acting: false }); }
  },

  // 归档（问题 #7）：已流转记录归档，列表默认隐藏
  async onArchive() {
    if (this.data.acting) return;
    try { await network.requireOnline(); } catch (e) { return; }
    const it = this.getSelected();
    if (!it) return;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '归档报修单', content: '归档后将从报修列表隐藏（数据保留可查）。确认归档？',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    this.setData({ acting: true });
    try {
      await api.archiveRepair(it._id);
      wx.showToast({ title: '已归档', icon: 'success' });
      this.setData({ selectedId: '' });
      await this.reload();
    } catch (err) { wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }); }
    finally { this.setData({ acting: false }); }
  },

  // 删除（问题 #7）：仅未流转（pending/rejected）可删，防审计断裂
  async onDelete() {
    if (this.data.acting) return;
    try { await network.requireOnline(); } catch (e) { return; }
    const it = this.getSelected();
    if (!it) return;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '删除报修单', content: '仅待审批/已驳回的报修单可删除，此操作不可恢复。确认删除？',
      success: (r) => resolve(r.confirm),
    }));
    if (!ok) return;
    this.setData({ acting: true });
    try {
      await api.deleteRepair(it._id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.setData({ selectedId: '' });
      await this.reload();
    } catch (err) { wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }); }
    finally { this.setData({ acting: false }); }
  },
});
