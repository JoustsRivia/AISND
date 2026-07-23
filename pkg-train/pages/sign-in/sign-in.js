// pkg-train/pages/sign-in/sign-in.js —— M9.2 我的培训 / 签到考核
const api = require('../../../utils/api');
const network = require('../../../utils/network');

const TRAIN_STATUS = {
  pending: '待签到',
  signed: '已签到',
  certified: '已认证',
  failed: '未通过',
  assigned: '待确认',
  confirmed: '已确认',
  completed: '已完成',
};

function isAdmin() {
  const role = getApp().globalData && getApp().globalData.role;
  return role === 'admin' || role === 'lead';
}

Page({
  data: {
    list: [],
    loading: true,
    isAdmin: false,
    // 评分弹窗
    showEvalModal: false,
    evalItem: null,
    evalScore: '',
    evalComment: '',
    submitting: false,
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ isAdmin: isAdmin() });
    await this.load();
  },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true });
    const list = await api.getMyTraining().catch(() => []);
    const mapped = (list || []).map((it) => ({
      ...it,
      _statusText: TRAIN_STATUS[it.status] || it.status || '未知',
    }));
    this.setData({ list: mapped, loading: false });
  },

  // 确认参训
  async onConfirm(e) {
    const item = e.currentTarget.dataset.item;
    if (item.status !== 'assigned') return;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.confirmTraining(item._id);
      wx.showToast({ title: '已确认', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '确认失败', icon: 'none' });
    }
  },

  // 打开评分弹窗（签到考核）
  onSignIn(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showEvalModal: true,
      evalItem: item,
      evalScore: '',
      evalComment: '',
      submitting: false,
    });
  },

  onScoreInput(e) { this.setData({ evalScore: e.detail.value }); },
  onCommentInput(e) { this.setData({ evalComment: e.detail.value }); },

  // 确认评分 + 签到
  async confirmEval() {
    const item = this.data.evalItem;
    if (!item) return;
    const score = parseInt(this.data.evalScore, 10);
    if (isNaN(score) || score < 0 || score > 100) {
      wx.showToast({ title: '请输入0-100分', icon: 'none' });
      return;
    }
    const comment = (this.data.evalComment || '').trim();
    this.setData({ submitting: true });
    try { await network.requireOnline(); } catch (err) { this.setData({ submitting: false }); return; }
    try {
      await api.evaluateTraining(item._id, { score, comment });
      await api.signInTraining({ id: item._id, score, certified: score >= 60 });
      wx.showToast({ title: '签到成功', icon: 'success' });
      this.setData({ showEvalModal: false });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '签到失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  cancelEval() {
    this.setData({ showEvalModal: false });
  },

  // 管理员标记完成
  async onComplete(e) {
    const item = e.currentTarget.dataset.item;
    try { await network.requireOnline(); } catch (err) { return; }
    try {
      await api.completeTraining(item._id);
      wx.showToast({ title: '已标记完成', icon: 'success' });
      await this.load();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
