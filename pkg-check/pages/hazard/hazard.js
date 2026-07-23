// pkg-check/pages/hazard/hazard.js —— M10.2 隐患管理
// R20：级别改 A/B/C/D 四色；位置增加 getLocation；考核对象联想搜索
const api = require('../../../utils/api');
const network = require('../../../utils/network');

// R20：隐患级别 A/B/C/D（杜绝类/严禁类/违章类/规范类）
const LEVEL_OPTIONS = [
  { key: 'A', label: 'A-杜绝类', desc: '红色·立即停工' },
  { key: 'B', label: 'B-严禁类', desc: '橙色·限期整改' },
  { key: 'C', label: 'C-违章类', desc: '黄色·跟踪整改' },
  { key: 'D', label: 'D-规范类', desc: '蓝色·建议改进' },
];

const HAZARD_STATUS = { open: '待整改', tracking: '跟踪中', closed: '已闭环' };

Page({
  data: {
    desc: '', levelIdx: 0, location: '', coords: '',
    levelOptions: LEVEL_OPTIONS,
    targetKeyword: '', targetResults: [], assessmentTarget: '', assessmentTargetName: '',
    list: [], loading: true, submitting: false,
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await this.loadList();
  },
  async onPullDownRefresh() { await this.loadList(); wx.stopPullDownRefresh(); },

  async loadList() {
    this.setData({ loading: true });
    const list = await api.getHazardList({}).catch(() => []);
    const mapped = (list || []).map((it) => ({
      ...it,
      _statusText: HAZARD_STATUS[it.status] || it.status || '未知',
      _assignee: it.assignee || '',
      _dueDate: it.dueDate || '',
      _records: (it.trackLogs || []).map((log) => ({
        time: log.time || '',
        title: it.desc,
        desc: log.note || log.progressNote || '',
        operator: log.operator || '',
        status: 'normal',
      })),
    }));
    this.setData({ list: mapped, loading: false });
  },

  onPickLevel(e) { this.setData({ levelIdx: +e.detail.value }); },
  bindDesc(e) { this.setData({ desc: e.detail.value }); },
  bindLocation(e) { this.setData({ location: e.detail.value }); },

  // R20：获取定位
  async onGetLocation() {
    try {
      const r = await wx.getLocation({ type: 'gcj02' });
      this.setData({ coords: r.longitude.toFixed(6) + ',' + r.latitude.toFixed(6) });
    } catch (err) {
      wx.showToast({ title: '定位失败，请手动输入', icon: 'none' });
    }
  },

  // R20：考核对象联想搜索
  onTargetSearch(e) {
    const keyword = e.detail.value;
    this.setData({ targetKeyword: keyword });
    if (!keyword.trim()) { this.setData({ targetResults: [] }); return; }
    // 调用 user list 搜索（api.listUsers 已有 keyword 参数支持，R10）
    api.listUsers().then((data) => {
      const list = (data && data.list) || data || [];
      const k = keyword.toLowerCase();
      const results = list.filter((u) =>
        [u.username, u.nickname, u.employeeId].some((f) => f != null && String(f).toLowerCase().includes(k))
      ).slice(0, 10);
      this.setData({ targetResults: results });
    }).catch(() => this.setData({ targetResults: [] }));
  },

  // R20：选中考核对象
  onTargetSelect(e) {
    const idx = +e.currentTarget.dataset.idx;
    const item = this.data.targetResults[idx];
    if (!item) return;
    this.setData({
      assessmentTarget: item._id || item.openid || '',
      assessmentTargetName: (item.nickname || item.username) + (item.employeeId ? '（' + item.employeeId + '）' : ''),
      targetKeyword: '', targetResults: [],
    });
  },

  // 子功能入口：现场检查 / 考核评比
  onGo(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },

  async onSubmit() {
    const desc = this.data.desc.trim();
    const location = this.data.location.trim();
    if (!desc || !location) {
      wx.showToast({ title: '请填写描述与位置', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (err) { return; }
    this.setData({ submitting: true });
    try {
      await api.reportHazard({
        desc,
        level: LEVEL_OPTIONS[this.data.levelIdx].key,
        location,
        coords: this.data.coords,
        assessmentTarget: this.data.assessmentTarget,
        assessmentTargetName: this.data.assessmentTargetName,
      });
      wx.showToast({ title: '已上报', icon: 'success' });
      this.setData({ desc: '', location: '', levelIdx: 0, coords: '', assessmentTarget: '', assessmentTargetName: '', targetKeyword: '', targetResults: [] });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: '上报失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onTapHazard(e) {
    const item = e.currentTarget.dataset.item;
    const r = await wx.showActionSheet({ itemList: ['指派整改人', '跟踪进度', '闭环隐患', '取消'] }).catch(() => null);
    if (!r || r.tapIndex === 3) return;
    try { await network.requireOnline(); } catch (err) { return; }
    if (r.tapIndex === 0) {
      await this.onAssign(item);
    } else if (r.tapIndex === 1) {
      const m = await wx.showModal({ title: '跟踪进度', editable: true, placeholderText: '请输入进度说明', content: '' });
      if (!m.confirm) return;
      const progressNote = (m.content || '').trim();
      if (!progressNote) { wx.showToast({ title: '请输入进度说明', icon: 'none' }); return; }
      await api.trackHazard(item._id, { progressNote });
      wx.showToast({ title: '已跟踪', icon: 'success' });
    } else if (r.tapIndex === 2) {
      await api.closeHazard(item._id);
      wx.showToast({ title: '已闭环', icon: 'success' });
    }
    await this.loadList();
  },

  // M10.2.3 隐患指派整改人 + 整改期限
  async onAssign(item) {
    const a = await wx.showModal({ title: '指派整改人', editable: true, placeholderText: '整改责任人姓名/工号', content: item._assignee || '' }).catch(() => null);
    if (!a || !a.confirm) return;
    const assignee = (a.content || '').trim();
    if (!assignee) { wx.showToast({ title: '请填写责任人', icon: 'none' }); return; }
    const d = await wx.showModal({ title: '整改期限', editable: true, placeholderText: 'YYYY-MM-DD', content: item._dueDate || '' }).catch(() => null);
    if (!d || !d.confirm) return;
    const dueDate = (d.content || '').trim();
    await api.assignHazard(item._id, { assignee, dueDate });
    wx.showToast({ title: '已指派', icon: 'success' });
  },
});
