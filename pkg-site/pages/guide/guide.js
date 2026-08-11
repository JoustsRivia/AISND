// pkg-site/pages/guide/guide.js —— M6 操作规程指引
const api = require('../../../utils/api');
const { catName } = require('../../../utils/display'); // 优化#13：类别中文

Page({
  data: {
    list: [],       // [{ _id, title, category, content }]
    selectedId: '',
    loading: true,
  },

  async onLoad() {
    const list = await api.getOpGuide().catch(() => []);
    // 优化#13：类别英文码 → 中文
    const mapped = (list || []).map((g) => ({ ...g, categoryText: catName(g.category) }));
    this.setData({ list: mapped, loading: false });
  },

  onTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedId: this.data.selectedId === id ? '' : id });
  },
});
