// pkg-check/pages/assessment/assessment.js —— M10 考核评比
const api = require('../../../utils/api');
const network = require('../../../utils/network');

const DIMENSIONS = ['综合', '现场管理', '隐患整改', '持证上岗', '台账规范'];

Page({
  data: {
    targetName: '', targetId: '', score: 80, scoreLabels: ['60', '70', '80', '90', '100'],
    dimIdx: 0, dimLabels: DIMENSIONS, note: '',
    list: [], loading: true, submitting: false,
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await this.loadList();
  },
  async onPullDownRefresh() { try { await this.loadList(); } finally { wx.stopPullDownRefresh(); } },

  async loadList() {
    this.setData({ loading: true });
    const list = await api.getAssessmentList({}).catch(() => []);
    const mapped = (list || []).map((it) => ({
      ...it,
      _statusText: it.score != null ? '已评分' : '待评分',
      _status: it.score != null ? 'normal' : 'pending_test',
    }));
    this.setData({ list: mapped, loading: false });
  },

  bindTarget(e) { this.setData({ targetName: e.detail.value }); },
  bindTargetId(e) { this.setData({ targetId: e.detail.value }); },
  onPickScore(e) { this.setData({ score: +this.data.scoreLabels[+e.detail.value] }); },
  onPickDim(e) { this.setData({ dimIdx: +e.detail.value }); },
  bindNote(e) { this.setData({ note: e.detail.value }); },

  async onSubmit() {
    const { targetName, targetId, score, dimIdx, note } = this.data;
    if (!targetName.trim() || !targetId.trim()) {
      wx.showToast({ title: '请填写被考核对象', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (err) { return; }
    this.setData({ submitting: true });
    try {
      await api.submitAssessment({
        targetName: targetName.trim(), targetId: targetId.trim(),
        score, dimension: DIMENSIONS[dimIdx], note: note.trim(),
      });
      wx.showToast({ title: '已提交', icon: 'success' });
      this.setData({ targetName: '', targetId: '', note: '', score: 80, dimIdx: 0 });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
