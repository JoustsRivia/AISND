// pkg-site/pages/briefing/briefing.js —— M6.2.3 班前交底记录
const api = require('../../../utils/api');

Page({
  data: { team: '', content: '', participants: '', date: '', photos: [], submitting: false },
  onParticipants(e) {
    const v = e.detail || {};
    this.setData({ participants: v.displayName || v.username || '' });
  },
  onPhotos(e) { this.setData({ photos: (e.detail && e.detail.value) || [] }); },
  onLoad() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    this.setData({ date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` });
  },
  bind(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  async onSubmit() {
    if (!this.data.content) { wx.showToast({ title: '请填写交底内容', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await api.recordBriefing({
        team: this.data.team, content: this.data.content,
        participants: this.data.participants, date: this.data.date,
        photos: this.data.photos.map((p) => p.id),
      });
      wx.showToast({ title: '已记录交底', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
