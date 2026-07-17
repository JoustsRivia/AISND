// pkg-train/pages/courses/courses.js —— M9.1 培训课程
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: { list: [], loading: true },

  async onLoad() { await this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true });
    const list = await api.getTrainingCourses().catch(() => []);
    this.setData({ list: list || [], loading: false });
  },

  async onAssign(e) {
    const item = e.currentTarget.dataset.item;
    try { await network.requireOnline(); } catch (err) { return; }
    const m = await wx.showModal({
      title: '指派培训',
      editable: true,
      placeholderText: '请输入用户ID（demo: user001）',
      content: '',
    });
    if (!m.confirm) return;
    const userId = (m.content || '').trim() || 'user001';
    try {
      await api.assignTraining({ userId, courseId: item._id });
      wx.showToast({ title: '已指派', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '指派失败', icon: 'none' });
    }
  },
});
