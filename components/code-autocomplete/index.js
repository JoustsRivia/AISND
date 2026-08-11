// components/code-autocomplete/index.js —— 器具编号联想输入（优化#12）
// 「使用与现场」各功能页共用的编号索引组件：输入部分编号 → 防抖联想匹配库内工器具 →
// 点选回传 code。以器具唯一编号为核心索引，替代各页裸文本输入。
// 用法：<code-autocomplete value="{{toolId}}" bind:pick="onPickCode" />
const api = require('../../utils/api');
const { TOOL_STATUS_LABELS } = require('../../utils/constants');

Component({
  properties: {
    placeholder: { type: String, value: '输入器具编号，支持部分编号联想' },
    value: { type: String, value: '' },
  },
  data: { kw: '', options: [], open: false, loading: false },

  lifetimes: {
    attached() { this.setData({ kw: this.data.value || '' }); },
  },
  observers: {
    value(v) { if (v !== this.data.kw) this.setData({ kw: v || '' }); },
  },

  methods: {
    onInput(e) {
      const kw = e.detail.value;
      this.setData({ kw, open: !!kw });
      clearTimeout(this._t);
      this._t = setTimeout(() => this.suggest(kw), 300); // 防抖 300ms
    },
    async suggest(kw) {
      const k = (kw || '').trim();
      if (!k) { this.setData({ options: [], open: false, loading: false }); return; }
      this.setData({ loading: true });
      const res = await api.getToolList({ keyword: k, size: 8 }).catch(() => null);
      const rows = (res && res.list) || [];
      this.setData({
        options: rows.map((t) => ({
          code: t.code || '', name: t.name || '',
          statusText: TOOL_STATUS_LABELS[t.status] || '',
        })),
        loading: false,
        open: rows.length > 0,
      });
    },
    onPick(e) {
      const code = e.currentTarget.dataset.code;
      if (!code) return;
      this.setData({ kw: code, options: [], open: false });
      this.triggerEvent('pick', { code });
    },
    onClear() {
      this.setData({ kw: '', options: [], open: false });
      this.triggerEvent('pick', { code: '' });
    },
    onBlur() {
      // 延迟收起，保证点选事件先触发
      setTimeout(() => this.setData({ open: false }), 200);
    },
  },
});
