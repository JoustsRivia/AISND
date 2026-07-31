// components/tool-card/tool-card.js
// 纯展示卡片：渲染器具概要；点击冒泡 'tap' 事件（携带 tool）。
Component({
  properties: {
    tool:      { type: Object, value: {} },
    showStore: { type: Boolean, value: true },
  },
  methods: {
    // 发射边界防护：wx:for 过渡期（清空/分页 concat）item 可能为 undefined，
    // 此时 this.data.tool 为 undefined（属性默认值 {} 不回填），直接冒泡会导致下游读取 ._id 崩溃。
    // 用 || {} 兜底，保证下游始终拿到对象（至少空对象），由调用方自行判断是否可调起详情。
    onTap() { this.triggerEvent('tap', { tool: this.data.tool || {} }); },
  },
});
