// components/tool-card/tool-card.js
// 纯展示卡片：渲染器具概要；点击冒泡 'tap' 事件（携带 tool）。
Component({
  properties: {
    tool:      { type: Object, value: {} },
    showStore: { type: Boolean, value: true },
  },
  methods: {
    onTap() { this.triggerEvent('tap', { tool: this.data.tool }); },
  },
});
