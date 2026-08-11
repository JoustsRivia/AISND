// components/chart/chart.js
// 纯展示组件：原生 canvas 2d 轻量图表（bar / line / pie），不引入 echarts 依赖。
// 颜色由页面以具体色值传入（canvas 无法读取 CSS 变量），组件仅做兜底。
function getDpr() {
  // libVersion 3.0.0 必有 wx.getWindowInfo（2.20.1+），不再回退已弃用的 getSystemInfoSync
  try {
    return wx.getWindowInfo().pixelRatio || 2;
  } catch (e) { return 2; }
}

Component({
  properties: {
    type: { type: String, value: 'bar' },   // bar | line | pie
    series: { type: Array, value: [] },      // [{ name, value, color }]
    height: { type: Number, value: 220 },    // 画布高度（px）
    title: { type: String, value: '' },
  },
  lifetimes: {
    ready() { this._ready = true; this._render(); },
  },
  observers: {
    'series,type': function () { if (this._ready) this._render(); },
  },
  methods: {
    _render() {
      const q = wx.createSelectorQuery().in(this);
      q.select('#cv').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = getDpr();
        const w = res[0].width, h = res[0].height;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        this._ctx = ctx; this._w = w; this._h = h;
        this._draw();
      });
    },
    _draw() {
      const ctx = this._ctx; if (!ctx) return;
      const { type, series } = this.properties;
      ctx.clearRect(0, 0, this._w, this._h);
      if (!series || !series.length) { this._empty(ctx); return; }
      if (type === 'pie') this._pie(ctx);
      else this._cartesian(ctx);
    },
    _empty(ctx) {
      ctx.fillStyle = 'rgba(120,120,120,0.6)'; ctx.font = '13px sans-serif';
      ctx.fillText('暂无数据', 14, 22);
    },
    _cartesian(ctx) {
      const { type, series } = this.properties;
      const w = this._w, h = this._h;
      const padL = 38, padR = 14, padT = 14, padB = 26;
      const cw = w - padL - padR, ch = h - padT - padB;
      const max = Math.max(1, ...series.map((s) => Number(s.value) || 0));
      const n = series.length;
      const step = n ? cw / n : cw;
      // 网格 + y 轴刻度
      ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
      for (let g = 0; g <= 3; g++) {
        const yv = max * (1 - g / 3);
        const y = padT + ch * (g / 3);
        ctx.strokeStyle = 'rgba(120,130,150,0.10)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
        ctx.fillStyle = 'rgba(110,120,140,0.85)';
        ctx.fillText(String(Math.round(yv)), 4, y);
      }
      // 坐标轴
      ctx.strokeStyle = 'rgba(120,130,150,0.25)'; ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + ch); ctx.lineTo(padL + cw, padT + ch); ctx.stroke();

      if (type === 'bar') {
        const bw = Math.min(30, step * 0.6);
        series.forEach((s, i) => {
          const x = padL + step * i + (step - bw) / 2;
          const bh = ch * ((Number(s.value) || 0) / max);
          const y = padT + ch - bh;
          ctx.fillStyle = s.color || '#1A56DB';
          this._rrect(ctx, x, y, bw, bh, 4); ctx.fill();
          ctx.fillStyle = 'rgba(60,70,90,0.9)'; ctx.textAlign = 'center';
          ctx.fillText(String(s.value), x + bw / 2, y - 7);
          ctx.fillStyle = 'rgba(90,100,120,0.85)';
          ctx.fillText(this._trunc(s.name, 4), x + bw / 2, padT + ch + 14);
          ctx.textAlign = 'left';
        });
      } else { // line
        const color = (series[0] && series[0].color) || '#1A56DB';
        const px = (i) => padL + step * i + step / 2;
        const py = (s) => padT + ch - ch * ((Number(s.value) || 0) / max);
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        series.forEach((s, i) => { const x = px(i), y = py(s); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
        series.forEach((s, i) => {
          const x = px(i), y = py(s);
          ctx.fillStyle = s.color || color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(60,70,90,0.9)'; ctx.textAlign = 'center';
          ctx.fillText(String(s.value), x, y - 8);
          ctx.fillStyle = 'rgba(90,100,120,0.85)';
          ctx.fillText(this._trunc(s.name, 4), x, padT + ch + 14);
          ctx.textAlign = 'left';
        });
      }
    },
    _pie(ctx) {
      const { series } = this.properties;
      const w = this._w, h = this._h;
      const cx = w / 2 - 30, cy = h / 2, r = Math.min(w / 2 - 50, h / 2 - 16);
      const total = series.reduce((a, s) => a + (Number(s.value) || 0), 0) || 1;
      let ang = -Math.PI / 2;
      series.forEach((s) => {
        const a2 = ang + (Number(s.value) || 0) / total * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, ang, a2); ctx.closePath();
        ctx.fillStyle = s.color || '#1A56DB'; ctx.fill();
        ang = a2;
      });
      // 图例
      ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const lx = cx + r + 18;
      series.forEach((s, i) => {
        const ly = cy - (series.length - 1) * 9 + i * 18;
        ctx.fillStyle = s.color || '#1A56DB'; this._rrect(ctx, lx, ly - 5, 10, 10, 2); ctx.fill();
        ctx.fillStyle = 'rgba(60,70,90,0.95)';
        ctx.fillText(`${this._trunc(s.name, 5)} ${Number(s.value) || 0}`, lx + 16, ly);
      });
    },
    _rrect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, Math.abs(h) / 2 || r);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    _trunc(s, n) { s = String(s == null ? '' : s); return n && s.length > n ? s.slice(0, n) + '…' : s; },
  },
});
