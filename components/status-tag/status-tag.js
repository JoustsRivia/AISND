// components/status-tag/status-tag.js
// 纯展示组件：依据 status 渲染颜色标签。不调用任何 api / wx.*。
const MAP = {
  qualified:    { text: '合格',   cls: 'success' },
  pending_test: { text: '待检',   cls: 'warning' },
  in_use:       { text: '领用中', cls: 'primary' },
  expired:      { text: '超期',   cls: 'danger' },
  scrapped:     { text: '报废',   cls: 'dark' },
  maintaining:  { text: '维修中', cls: 'primary' },
  missing:      { text: '缺失',   cls: 'danger' },
  forbidden:    { text: '禁用',   cls: 'dark' },
  disabled:     { text: '已禁用', cls: 'dark' },
  lease:        { text: '租赁',   cls: 'info' },
  normal:       { text: '正常',   cls: 'success' },
};

Component({
  properties: {
    status: { type: String, value: 'qualified' },
    text:   { type: String, value: '' },     // 显式覆盖文案
    size:   { type: String, value: 'md' },   // sm | md
    plain:  { type: Boolean, value: false },
  },
  data: { cls: 'success', label: '合格' },
  observers: {
    'status,text': function (status, text) {
      // 修复：status 可能为 null/undefined（老数据缺字段），归一化避免
      // 「expected <string> but got null」类型告警；缺失状态显示「未知」而非误标「正常」
      const s = status || '';
      const m = MAP[s] || (s ? MAP.normal : { text: '未知', cls: 'info' });
      this.setData({ cls: m.cls, label: text || m.text });
    },
  },
});
