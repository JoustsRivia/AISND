// components/search-picker —— D11/D17 通用可搜索选择器
// 用法：<search-picker fetch="tools" displayKey="name" bind:pick="onSelect" />
//   fetch='tools' → api.getToolList({keyword})，fetch='users' → api.listUsers()，fetch='stores' → api.getStoreList()
const api = require('../../utils/api');
const { catName } = require('../../utils/display'); // 类别英文码 → 中文（选项副信息）
Component({
  properties: {
    placeholder: { type: String, value: '请搜索选择' },
    fetch:       { type: String, value: '' },    // tools | users | stores
    displayKey:  { type: String, value: 'name' }, // 默认取 name
    label:       { type: String, value: '' },
  },
  data: { kw: '', items: [], show: false, picked: null, pickedLabel: '' },
  methods: {
    async onFocus() {
      this.setData({ show: true });
      await this.search('');
    },
    async onInput(e) {
      const kw = e.detail.value;
      this.setData({ kw });
      await this.search(kw);
    },
    async search(kw) {
      let list = [];
      try {
        if (this.data.fetch === 'tools') {
          const r = await api.getToolList({ keyword: kw, size: 50 }).catch(() => ({ list: [] }));
          // 选项带唯一特征副信息（库房 · 类别）：同名称器具可借编号/库房/类别分辨
          list = (r.list || []).map((t) => ({
            id: t._id, name: t.name, code: t.code,
            subtitle: [t.store, catName(t.category)].filter(Boolean).join(' · '),
            raw: t,
          }));
        } else if (this.data.fetch === 'users') {
          const r = await api.listUsers().catch(() => []);
          const arr = (r.list || r || []);
          const k = String(kw || '').toLowerCase();
          list = arr.filter((u) => !k || [u.username, u.nickname, u.employeeId].some((f) => f != null && String(f).toLowerCase().includes(k)))
            .slice(0, 20).map((u) => ({ id: u._id || u.openid, name: (u.nickname || u.username) + (u.employeeId ? '（' + u.employeeId + '）' : ''), raw: u }));
        } else if (this.data.fetch === 'stores') {
          const r = await api.getStoreList({}).catch(() => []);
          list = (r || []).map((s) => ({ id: s._id, name: s.name, raw: s }));
        }
      } catch (e) { list = []; }
      this.setData({ items: list });
    },
    onPick(e) {
      const i = e.currentTarget.dataset.idx;
      const item = this.data.items[i];
      // 选中态带编号，同名称器具可分辨
      this.setData({ picked: item, pickedLabel: item.name + (item.code ? '（' + item.code + '）' : ''), show: false });
      this.triggerEvent('pick', { value: item });
    },
    onBlur() { setTimeout(() => this.setData({ show: false }), 200); },
    onClear() { this.setData({ picked: null, pickedLabel: '', kw: '', items: [], show: false }); this.triggerEvent('pick', { value: null }); },
  },
});
