// pkg-scrap/pages/disposal/disposal.js —— M8.2 报废处置（回收/销毁/台账同步）
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    list: [], loading: true, showForm: false, cur: null,
    methods: [{ v: 'cut', n: '切割破坏' }, { v: 'crush', n: '碾压破坏' }, { v: 'other', n: '其他不可逆' }],
    mIdx: 0, destroyedAt: '', handler: '', photos: [], submitting: false,
  },

  async onLoad() { this.load(); },
  async load() {
    const r = await api.getScrapList({ status: 'approved' }).catch(() => []);
    this.setData({ list: r || [], loading: false });
  },

  openForm(e) {
    const cur = this.data.list.find((x) => x._id === e.currentTarget.dataset.id);
    if (!cur) return; // 优化#2 空值守卫：find 无命中时不向 data 注入 undefined
    this.setData({ showForm: true, cur });
  },
  onMethod(e) { this.setData({ mIdx: +e.detail.value }); },
  onDate(e) { this.setData({ destroyedAt: e.detail.value }); },
  onHandler(e) { this.setData({ handler: e.detail.value }); },

  async onPhoto() {
    const m = await wx.chooseMedia({ count: 3, mediaType: ['image'] });
    const ids = await Promise.all(m.tempFiles.map((f) => api.uploadFile(f.tempFilePath, 'image')));
    this.setData({ photos: this.data.photos.concat(ids) });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    if (!this.data.cur) return;
    this.setData({ submitting: true });
    try {
      await api.recordScrapDisposal({
        scrapId: this.data.cur._id,
        method: this.data.methods[this.data.mIdx].v,
        destroyedAt: this.data.destroyedAt, handler: this.data.handler, photos: this.data.photos,
      });
      this.setData({ showForm: false, cur: null, photos: [], destroyedAt: '', handler: '' });
      wx.showToast({ title: '处置完成', icon: 'success' });
      this.load();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
