// pkg-check/pages/performance/performance.js —— M10.3 人员考核（评分/排行榜/奖惩）
const api = require('../../../utils/api');
const network = require('../../../utils/network');

const DIMS = ['综合', '现场管理', '隐患整改', '持证上岗', '台账规范'];
const REWARD_TYPES = [
  { v: 'reward', n: '奖励' },
  { v: 'penalty', n: '处罚' },
];

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

Page({
  data: {
    tab: 'rank',
    month: thisMonth(),
    // 评分
    personId: '', personName: '', dimIdx: 0, dims: DIMS, score: 80, scoreLabels: ['60', '70', '80', '90', '100'],
    scores: [], submitting: false,
    // 排行榜
    rank: [], summary: null,
    // 奖惩
    rewardTypes: REWARD_TYPES, rtypeIdx: 0, rpersonId: '', rpersonName: '', rreason: '', ramount: '',
    rewards: [],
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await this.loadRank();
  },
  async onPullDownRefresh() { try { await this.refresh(); } finally { wx.stopPullDownRefresh(); } },

  refresh() {
    if (this.data.tab === 'rank') return this.loadRank();
    if (this.data.tab === 'score') return this.loadScores();
    return this.loadRewards();
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.v;
    this.setData({ tab });
    if (tab === 'rank') this.loadRank();
    else if (tab === 'score') this.loadScores();
    else this.loadRewards();
  },

  // ── 评分 ──
  async loadScores() {
    const list = await api.getPerformanceList({ month: this.data.month }).catch(() => []);
    this.setData({ scores: list || [] });
  },
  bindPerson(e) { this.setData({ personId: e.detail.value }); },
  bindPersonName(e) { this.setData({ personName: e.detail.value }); },
  onPickDim(e) {
    const i = Math.max(0, Math.min(DIMS.length - 1, +e.detail.value));
    this.setData({ dimIdx: i });
  },
  onPickScore(e) {
    const i = Math.max(0, Math.min(this.data.scoreLabels.length - 1, +e.detail.value));
    this.setData({ score: +this.data.scoreLabels[i] });
  },

  async onSubmitScore() {
    const { personId, personName, score, month } = this.data;
    const dimIdx = Math.max(0, Math.min(DIMS.length - 1, this.data.dimIdx));
    if (!personId.trim() || !personName.trim()) {
      wx.showToast({ title: '请填写被考核人', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (err) { return; }
    this.setData({ submitting: true });
    try {
      await api.scorePerformance({
        personId: personId.trim(), personName: personName.trim(),
        dimension: DIMS[dimIdx], score, month,
      });
      wx.showToast({ title: '已评分', icon: 'success' });
      this.setData({ personId: '', personName: '', dimIdx: 0, score: 80 });
      await this.loadScores();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ── 排行榜 ──
  async loadRank() {
    const [rank, summary] = await Promise.all([
      api.getPerformanceRank({ month: this.data.month }).catch(() => []),
      api.getPerformanceSummary({ month: this.data.month }).catch(() => null),
    ]);
    const max = Math.max(1, ...(rank || []).map((r) => r.avg));
    const mapped = (rank || []).map((r) => ({ ...r, _w: Math.round((r.avg / max) * 100) }));
    this.setData({ rank: mapped, summary });
  },

  // ── 奖惩 ──
  async loadRewards() {
    const list = await api.getRewardList({ month: this.data.month }).catch(() => []);
    const mapped = (list || []).map((r) => ({ ...r, _type: r.type === 'reward' ? '奖励' : '处罚' }));
    this.setData({ rewards: mapped });
  },
  onPickRtype(e) {
    const i = Math.max(0, Math.min(REWARD_TYPES.length - 1, +e.detail.value));
    this.setData({ rtypeIdx: i });
  },
  bindRPerson(e) { this.setData({ rpersonId: e.detail.value }); },
  bindRPersonName(e) { this.setData({ rpersonName: e.detail.value }); },
  bindRReason(e) { this.setData({ rreason: e.detail.value }); },
  bindRAmount(e) { this.setData({ ramount: e.detail.value }); },

  async onSubmitReward() {
    const { rpersonId, rpersonName, rtypeIdx, rreason, ramount, month } = this.data;
    if (!rpersonId.trim() || !rpersonName.trim()) {
      wx.showToast({ title: '请填写人员', icon: 'none' });
      return;
    }
    try { await network.requireOnline(); } catch (err) { return; }
    wx.showLoading({ title: '提交中' });
    try {
      await api.addReward({
        personId: rpersonId.trim(), personName: rpersonName.trim(),
        type: REWARD_TYPES[rtypeIdx].v, reason: rreason.trim(), amount: +ramount || 0, month,
      });
      wx.showToast({ title: '已登记', icon: 'success' });
      this.setData({ rpersonId: '', rpersonName: '', rreason: '', ramount: '' });
      await this.loadRewards();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
